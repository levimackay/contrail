#!/bin/sh
# Contrail tripwire hook (PreToolUse).
# Contract: read one hook payload on stdin; print at most one {"systemMessage": ...} line,
# which Claude Code shows to the person and does not give to the model; exit 0. It never
# blocks and never makes a permission decision, and any failure prints nothing.

payload=$(cat) || exit 0

# Start a runtime only for calls that could be sensitive; contrail tripwire decides the rest.
# A shell command is matched on its text. A file tool is matched on its path alone, never on
# the content it writes, so ordinary edits never start one.
case ${1:-} in
  path)
    path=$(printf '%s' "$payload" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
    case $path in
      *.aws/* | *.ssh/* | *id_rsa* | *id_ed25519* | *id_ecdsa* | *.netrc | *.npmrc | *.pypirc | *.docker/* | *.kube/*) ;;
      *.gnupg/* | *.env | *.env.* | *credentials* | *secret* | *keychain* | *.pgpass | *.my.cnf | *gcloud/* | *.azure/*) ;;
      *.vault-token | *.boto | *.config/gh/* | *plugins/data/contrail*) ;;
      *) exit 0 ;;
    esac
    ;;
  *)
    # Each pattern is a substring, so *ncat* also covers truncate.
    case $payload in
      *curl* | *wget* | *ssh* | *scp* | *rsync* | *" nc "* | *ncat* | *ftp* | *"git push"* | *"gh api"*) ;;
      *.aws* | *.netrc* | *.npmrc* | *.pypirc* | *.docker* | *.kube* | *.gnupg* | *id_rsa* | *id_ed25519* | *id_ecdsa*) ;;
      *.env* | *printenv* | *" env"* | *keychain* | *credentials* | *secret* | *gcloud* | *.azure* | *.pgpass* | *.my.cnf*) ;;
      *.vault-token* | *.boto* | *install* | *" add "* | *npx* | *"go get"* | *"rm -"* | *"git reset"* | *"git clean"*) ;;
      *chmod* | *eval* | *" dd "* | *mkfs* | *drop* | *contrail.db* | *CONTRAIL_HOME*) ;;
      *) exit 0 ;;
    esac
    ;;
esac

here=$(CDPATH='' cd -- "$(dirname -- "$0")/.." 2>/dev/null && pwd) || exit 0
printf '%s' "$payload" | sh "$here/bin/contrail" tripwire --from-hook 2>/dev/null
exit 0
