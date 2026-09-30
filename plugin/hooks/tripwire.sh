#!/bin/sh
# Contrail tripwire hook (PreToolUse).
# Contract: read one hook payload on stdin; print at most one {"systemMessage": ...} line,
# which Claude Code shows to the person and does not give to the model; exit 0. It never
# blocks and never makes a permission decision, and any failure prints nothing.

payload=$(cat) || exit 0

# Start a runtime only for calls that could be sensitive; contrail tripwire decides the rest.
case $payload in
  *curl* | *wget* | *ssh* | *scp* | *rsync* | *" nc "* | *ncat* | *sftp* | *ftp* | *"git push"* | *"gh api"*) ;;
  *.aws* | *.netrc* | *.npmrc* | *.pypirc* | *.docker* | *.kube* | *.gnupg* | *id_rsa* | *id_ed25519* | *id_ecdsa*) ;;
  *.env* | *printenv* | *env* | *keychain* | *credentials* | *secret* | *.git-credentials* | *gcloud* | *.azure* | *.pgpass* | *.my.cnf* | *.vault-token* | *.boto*) ;;
  *install* | *" add "* | *npx* | *"go get"* | *"rm -"* | *"git reset"* | *"git clean"* | *chmod* | *eval* | *" dd "* | *mkfs* | *drop* | *truncate*) ;;
  *) exit 0 ;;
esac

here=$(CDPATH='' cd -- "$(dirname -- "$0")/.." 2>/dev/null && pwd) || exit 0
printf '%s' "$payload" | sh "$here/bin/contrail" tripwire --from-hook 2>/dev/null
exit 0
