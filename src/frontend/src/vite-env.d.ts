/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
