// Vercel serverless entrypoint — re-exports the same Express app used for local dev
// (npm run server) and Render, so there's exactly one server implementation to maintain.
export { default } from '../server/index';
