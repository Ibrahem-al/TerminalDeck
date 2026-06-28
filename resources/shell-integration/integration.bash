# Quarterdeck shell integration for bash (Git Bash).
# Passed via `bash --init-file`, which replaces the normal startup files,
# so the user's own configuration is sourced first.

if [ -f /etc/profile ]; then . /etc/profile; fi
if [ -f ~/.bash_profile ]; then . ~/.bash_profile
elif [ -f ~/.bash_login ]; then . ~/.bash_login
elif [ -f ~/.profile ]; then . ~/.profile
fi
case $- in
  *i*) [ -f ~/.bashrc ] && [ -z "${__QD_BASHRC_DONE:-}" ] && . ~/.bashrc ;;
esac

# OSC 133 hooks: D (previous exit code) + A (prompt start) each prompt,
# B at end of PS1 (input starts), C just before a command executes.
__qd_first_prompt=1
__qd_prompt() {
  local ec=$?
  if [ -z "$__qd_first_prompt" ]; then
    printf '\033]133;D;%s\007' "$ec"
  fi
  __qd_first_prompt=""
  printf '\033]133;A\007'
  # Report the current directory (OSC 9;9) for the pane header.
  printf '\033]9;9;%s\007' "$PWD"
}

PROMPT_COMMAND="__qd_prompt${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
PS0='\e]133;C\a'"${PS0:-}"
PS1="${PS1:-\\w \\$ }"'\[\e]133;B\a\]'
