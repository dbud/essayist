// Options shared by all kvctl subcommands, declared on the root command.
export type KvctlGlobals = {
  /** The D1 database id; overrides CLOUDFLARE_D1_DATABASE_ID. */
  target?: string;
  /** Only ever true or absent: --local reads the vite dev D1 state. */
  local?: true;
};
