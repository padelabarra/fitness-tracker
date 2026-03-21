import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const { username, password } = credentials as {
          username: string
          password: string
        }

        // Leer aquí, en runtime
        const USERS = [
          {
            id: process.env.USER1_ID!,
            username: process.env.USER1_USERNAME!,
            passwordHash: process.env.USER1_PASSWORD_HASH!,
          },
          {
            id: process.env.USER2_ID!,
            username: process.env.USER2_USERNAME!,
            passwordHash: process.env.USER2_PASSWORD_HASH!,
          },
        ]

        const user = USERS.find(u => u.username === username)
        if (!user || !user.passwordHash) return null
        const valid = await compare(password, user.passwordHash)
        if (!valid) return null
        return { id: user.id, name: user.username }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.userId = user.id
      return token
    },
    session({ session, token }) {
      if (token.userId) session.user.id = token.userId as string
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
})
