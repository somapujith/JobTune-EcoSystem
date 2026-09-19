// Build-time stub for unzipper's OPTIONAL S3 source (ADR-001 spike S2).
// `unzipper/lib/Open` requires "@aws-sdk/client-s3" for its S3 opener; the package is not installed and is
// never called on the Worker path. Without an alias wrangler fails the WHOLE bundle with
// `Could not resolve "@aws-sdk/client-s3"` (a lazy import() cannot isolate a build-time error).
// Wired in backend/wrangler.toml [alias]. Copied from backend/spike/docs/stubs/ (proven there).
export const GetObjectCommand = undefined;
export const HeadObjectCommand = undefined;
