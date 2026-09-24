# @kingsguard/cli

This package is an unpublished, minimal command-line entry for Kingsguard. It
supports `--help` and `--version`.

With no arguments, the CLI shows help. `--help` anywhere in the arguments
shows help, taking precedence over `--version`. Otherwise, `--version` anywhere
shows the version. Both requests ignore other arguments and exit with code 0.
Unrecognized arguments alone produce a usage error on stderr and exit with code 2.

```sh
kingsguard --help
kingsguard --version
```

The package requires Node.js 22.12.0 or later for this inert entry point. This is
not a final installer runtime statement, and this README makes no claim that the
package is available from a registry.
