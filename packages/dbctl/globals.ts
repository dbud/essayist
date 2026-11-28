// Options shared by all kvctl subcommands, declared on the root command.
export type KvctlGlobals = {
  /** Only ever true or absent: --local works on the D1 state of the vite dev server. */
  local?: true;
};
