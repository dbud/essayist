// Options shared by all kvctl subcommands, declared on the root command.
export type KvctlGlobals = {
  target?: string;
  /** Only ever true or absent: --local is a presence flag. */
  local?: true;
};
