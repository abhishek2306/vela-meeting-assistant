import { PrismaAdapter } from "@auth/prisma-adapter";
import { AuthOptions, DefaultSession } from "next-auth";

declare module "next-auth" {
    interface Session {
        user: {
            id: string;
        } & DefaultSession["user"];
    }
}

import GoogleProvider from "next-auth/providers/google";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const authOptions: AuthOptions = {
    adapter: PrismaAdapter(prisma) as any,
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
            allowDangerousEmailAccountLinking: true,
            authorization: {
                params: {
                    scope: "openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/contacts.other.readonly",
                    prompt: "consent",
                    access_type: "offline",
                    response_type: "code"
                }
            }
        })
    ],
    callbacks: {
        async session({ session, user, token }) {
            // Send properties to the client
            if (token) {
                (session as any).accessToken = token.accessToken;
            }
            if (user) {
                session.user.id = user.id;
            }
            return session;
        },
        async jwt({ token, account }) {
            if (account) {
                token.accessToken = account.access_token;
            }
            return token;
        }
    },
    session: {
        strategy: "jwt"
    }
};
