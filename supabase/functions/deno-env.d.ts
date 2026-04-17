/** Minimal Deno globals for Edge Functions — matches deploy runtime; satisfies IDE when not using Deno LSP. */
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};
