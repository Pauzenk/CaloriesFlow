import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy, type IVerifyOptions } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import connectPgSimple from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { Resend } from "resend";
import { pool } from "./db";
import { storage } from "./storage";
import { insertUserSchema, loginSchema, type AuthUser, type User } from "@shared/schema";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function sendVerificationEmail(toEmail: string, code: string): Promise<void> {
  if (!resend) {
    console.log(`[forgot-password] No RESEND_API_KEY — code for ${toEmail}: ${code}`);
    return;
  }
  await resend.emails.send({
    from: "CalorieFlow <onboarding@resend.dev>",
    to: toEmail,
    subject: "Your CalorieFlow verification code",
    html: `
      <div style="font-family:'Space Mono',monospace;background:#F2EDE7;padding:40px 24px;min-height:100vh;">
        <div style="max-width:400px;margin:0 auto;background:#ffffff;border:1px solid #D4CFC8;padding:32px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:28px;">
            <div style="width:36px;height:36px;background:#3c3a40;display:flex;align-items:center;justify-content:center;">
              <span style="color:#fff;font-size:18px;">🌿</span>
            </div>
            <span style="font-size:20px;font-weight:700;color:#1C1714;letter-spacing:-0.5px;">CalorieFlow</span>
          </div>
          <h2 style="font-size:22px;font-weight:700;color:#1C1714;margin:0 0 8px;">Your verification code</h2>
          <p style="font-size:13px;color:#6B6560;margin:0 0 28px;line-height:1.6;">Use this code to reset your password. It expires in 10 minutes.</p>
          <div style="border:1px solid #1C1714;padding:20px;text-align:center;margin-bottom:28px;">
            <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#1C1714;">${code}</span>
          </div>
          <p style="font-size:11px;color:#6B6560;margin:0;line-height:1.6;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      </div>
    `,
  });
}

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
      rolling: true,
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

  // ── Forgot-password flow ─────────────────────────────────────────────────────
  // In-memory store: email → { code, expiresAt }
  const pendingCodes = new Map<string, { code: string; expiresAt: number }>();

  app.post("/api/auth/forgot-password", async (req, res) => {
    const { email } = req.body as { email?: string };
    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Email is required" });
    }
    const normalised = email.trim().toLowerCase();
    // Always respond 200 to avoid user enumeration
    const user = await storage.getUserByEmail(normalised);
    if (user) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      pendingCodes.set(normalised, { code, expiresAt: Date.now() + 10 * 60 * 1000 });
      await sendVerificationEmail(normalised, code);
    }
    res.json({ ok: true });
  });

  app.post("/api/auth/verify-code", (req, res) => {
    const { email, code } = req.body as { email?: string; code?: string };
    if (!email || !code) return res.status(400).json({ message: "Email and code are required" });
    const normalised = email.trim().toLowerCase();
    const entry = pendingCodes.get(normalised);
    if (!entry || Date.now() > entry.expiresAt) {
      return res.status(400).json({ message: "Code expired or not found" });
    }
    if (entry.code !== code.trim()) {
      return res.status(400).json({ message: "Invalid code" });
    }
    // Mark as verified — extend expiry for the reset step
    pendingCodes.set(normalised, { code: `verified:${code}`, expiresAt: Date.now() + 15 * 60 * 1000 });
    res.json({ ok: true });
  });

  app.post("/api/auth/reset-password", async (req, res, next) => {
    const { email, code, password } = req.body as { email?: string; code?: string; password?: string };
    if (!email || !code || !password) {
      return res.status(400).json({ message: "Email, code, and password are required" });
    }
    if (typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    const normalised = email.trim().toLowerCase();
    const entry = pendingCodes.get(normalised);
    if (!entry || Date.now() > entry.expiresAt || entry.code !== `verified:${code.trim()}`) {
      return res.status(400).json({ message: "Code invalid or expired — please restart the flow" });
    }
    try {
      const user = await storage.getUserByEmail(normalised);
      if (!user) return res.status(404).json({ message: "User not found" });
      const hashed = await hashPassword(password);
      await storage.updateUserPassword(user.id, hashed);
      pendingCodes.delete(normalised);
      const safe = sanitizeUser(user);
      req.login(safe, (err) => {
        if (err) return next(err);
        res.json(safe);
      });
    } catch (err) {
      next(err);
    }
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ message: "Not authenticated" });
}
