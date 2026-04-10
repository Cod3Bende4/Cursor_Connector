-- copy-last-response.applescript
-- Best-effort: activate Cursor and send Copy (Cmd+C) so the assistant reply can reach
-- the clipboard for Strategy A. Focus must be on a message bubble for this to work;
-- customize this script for your Cursor version if needed.

on run
  set appName to "Cursor"
  tell application appName to activate
  delay 0.35
  tell application "System Events"
    tell process appName
      try
        keystroke "c" using command down
      on error errMsg
        return "copy_failed: " & errMsg
      end try
    end tell
  end tell
  return "ok"
end run
