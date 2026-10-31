/**
 * Server-only Microsoft OAuth configuration.
 *
 * Never import this module from a client component. The secret belongs in Vercel's
 * server environment and must not be committed or rendered in the browser.
 */
module.exports = {
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
}
