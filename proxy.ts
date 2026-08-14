import { NextRequest, NextResponse } from "next/server";
import {
  getHomeFinderInstallation,
  InstallationNotFoundError,
} from "@/src/lib/installations";

export function proxy(request: NextRequest) {
  const installationId = request.nextUrl.pathname.split("/")[2];
  if (!installationId) return NextResponse.next();

  try {
    const installation = getHomeFinderInstallation(installationId);
    const response = NextResponse.next();
    const frameAncestors = ["'self'", ...installation.allowedOrigins].join(" ");
    response.headers.set(
      "Content-Security-Policy",
      `frame-ancestors ${frameAncestors}`,
    );
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  } catch (error) {
    if (error instanceof InstallationNotFoundError) {
      return NextResponse.next();
    }
    throw error;
  }
}

export const config = {
  matcher: "/embed/:path*",
};
