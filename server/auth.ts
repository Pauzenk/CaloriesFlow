import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy, type IVerifyOptions } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import connectPgSimple from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { pool } from "./db";
import { storage } from "./storage";
import { insertUserSchema, loginSchema, type AuthUser, type User } from "@shared/schema";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function verifyPassword(stored: string, supplied: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  if (!hashed || !salt) return false;
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return hashedBuf.length === suppliedBuf.length && timingSafeEqual(hashedBuf, suppliedBuf);
}

declare global {
  namespace Express {
    interface User extends AuthUser {}
  }
}

function sanitizeUser(user: User): AuthUser {
  return { id: user.id, email: user.email, name: user.name };
}

export function setupAuth(app: Express) {
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set in production");
  }
  const PgStore = connectPgSimple(session);
  const sessionStore = new PgStore({
    pool,
    createTableIfMissing: true,
    tableName: "user_sessions",
  });

  const sessionSecret = process.env.SESSION_SECRET || "dev-secret-change-me";

  app.set("trust proxy", 1);
  app.use(
    session({
      store: sessionStore,
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 30,
        sameSite: "lax",
      },
    }),
  );

  // ── Passport strategies ──────────────────────────────────────────────────────

  passport.use(
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email: string, password: string, done: (err: Error | null, user?: AuthUser | false, options?: IVerifyOptions) => void) => {
        try {
          const user = await storage.getUserByEmail(email);
          if (!user) return done(null, false, { message: "Invalid credentials" });
          if (!user.password) return done(null, false, { message: "This account uses Google sign-in. Please use the Google button." });
          const ok = await verifyPassword(user.password, password);
          if (!ok) return done(null, false, { message: "Invalid credentials" });
          return done(null, sanitizeUser(user));
        } catch (err) {
          return done(err as Error);
        }
      },
    ),
  );

  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (googleClientId && googleClientSecret) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: googleClientId,
          clientSecret: googleClientSecret,
          callbackURL: "/api/auth/google/callback",
          proxy: true,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value;
            const name = profile.displayName || profile.name?.givenName || "User";
            const googleId = profile.id;

            const byGoogleId = await storage.getUserByGoogleId(googleId);
            if (byGoogleId) return done(null, sanitizeUser(byGoogleId));

            if (email) {
              const byEmail = await storage.getUserByEmail(email);
              if (byEmail) {
                await storage.linkGoogleAccount(byEmail.id, googleId);
                return done(null, sanitizeUser(byEmail));
              }
              const created = await storage.createGoogleUser({ email, name, googleId });
              return done(null, sanitizeUser(created));
            }

            return done(new Error("Google account has no email address"));
          } catch (err) {
            return done(err as Error);
          }
        },
      ),
    );
  }

  passport.serializeUser((user: Express.User, done: (err: Error | null, id?: string) => void) => done(null, user.id));
  passport.deserializeUser(async (id: string, done: (err: Error | null, user?: AuthUser | false) => void) => {
    try {
      const user = await storage.getUser(id);
      if (!user) return done(null, false);
      done(null, sanitizeUser(user));
    } catch (err) {
      done(err as Error);
    }
  });

  // ── IMPORTANT: initialize passport BEFORE registering any routes ────────────
  app.use(passport.initialize());
  app.use(passport.session());

  // ── Google OAuth routes ──────────────────────────────────────────────────────
  if (googleClientId && googleClientSecret) {
    app.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

    app.get(
      "/api/auth/google/callback",
      passport.authenticate("google", { failureRedirect: "/login?error=google_failed" }),
      (_req, res) => {
        res.redirect("/");
      },
    );
  }

  // ── Local auth routes ────────────────────────────────────────────────────────
  app.post("/api/auth/register", async (req, res, next) => {
    const parsed = insertUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    }
    try {
      const existing = await storage.getUserByEmail(parsed.data.email);
      if (existing) return res.status(409).json({ message: "Email already registered" });
      const hashed = await hashPassword(parsed.data.password!);
      const user = await storage.createUser({ ...parsed.data, password: hashed });
      const safe = sanitizeUser(user);
      req.login(safe, (err) => {
        if (err) return next(err);
        res.status(201).json(safe);
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input" });
    passport.authenticate("local", (err: Error | null, user: AuthUser | false, info: IVerifyOptions | undefined) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Invalid credentials" });
      req.login(user, (err2) => {
        if (err2) return next(err2);
        res.json(user);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.json({ ok: true });
      });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    res.json(req.user);
  });

  app.get("/api/auth/providers", (_req, res) => {
    res.json({ google: !!(googleClientId && googleClientSecret) });
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ message: "Not authenticated" });
}
