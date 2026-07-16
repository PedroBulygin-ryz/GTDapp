#!/bin/zsh

INBOX="$HOME/Documents/Bubbles/inbox.txt"
mkdir -p "$(dirname "$INBOX")"
touch "$INBOX"

/usr/bin/osascript <<'APPLESCRIPT'
try
  display dialog "¿Vaciar inbox.txt de Bubbles?" buttons {"Cancelar", "Vaciar"} default button "Vaciar" cancel button "Cancelar" with icon caution
on error number -128
  error number -128
end try
APPLESCRIPT

if [ "$?" -eq 0 ]; then
  : > "$INBOX"
fi
