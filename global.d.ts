// Ambient declaration for CSS side-effect imports (e.g. `import "./globals.css"`).
// Next.js generates this under .next/types during a build; declaring it here keeps
// a bare `tsc --noEmit` happy before the first build runs.
declare module '*.css';
