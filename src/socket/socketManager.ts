import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import proxyaddr from "proxy-addr";
import { env } from "../config/env";

interface JwtPayload {
  id: string;
  email: string;
  role: string;
}

interface AuthSocket extends Socket {
  user?: JwtPayload;
  clientIp?: string;
}

// Engine.IO's own `socket.handshake.address` is read straight off the raw TCP
// connection (see engine.io's Socket#remoteAddress) — it has no concept of
// X-Forwarded-For, so behind a reverse proxy it always reports the proxy's own
// address, never the real client. `proxy-addr` is the same library Express's
// `app.set("trust proxy", ...)` uses internally (server.ts:125), so trusting
// exactly 1 hop here keeps the two in sync — change both together.
const TRUST_PROXY_HOPS = 1;
const trustHop = (_addr: string, i: number) => i < TRUST_PROXY_HOPS;

const resolveClientIp = (socket: Socket): string =>
  proxyaddr(socket.request, trustHop);

const initSocket = (io: Server) => {
  io.use(async (socket: AuthSocket, next) => {
    try {
      const cookieHeader = socket.handshake.headers?.cookie ?? "";
      const token =
        socket.handshake.auth?.token ||
        cookieHeader
          .split(";")
          .find((c: string) => c.trim().startsWith("jwt="))
          ?.split("=")[1];

      if (!token) return next(new Error("Authentication error"));

      const user = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      socket.user = user;
      next();
    } catch {
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", (socket: AuthSocket) => {
    const user = socket.user!;
    socket.clientIp = resolveClientIp(socket);
    console.log(`Connected: ${user.email} | Role: ${user.role} | IP: ${socket.clientIp}`);

    if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
      socket.join("admin-room");
      console.log(`Admin ${user.email} joined secure admin-room`);
    }

    socket.join(user.id);
    console.log(`User ${user.id} joined their private notification room`);

    socket.on("disconnect", (reason) => {
      console.log(`User ${user.email} disconnected | Reason: ${reason} | IP: ${socket.clientIp}`);
    });
  });
};

export default initSocket;
