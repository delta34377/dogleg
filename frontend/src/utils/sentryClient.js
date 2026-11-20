// The only parts of Sentry the app uses. monitoring.js loads this file with
// import() only when a DSN is configured. Naming the three functions here
// (instead of importing the whole package) lets the build leave out the parts
// we don't use, such as session replay, so the download stays small.
export { init, captureException, setUser } from '@sentry/react'
