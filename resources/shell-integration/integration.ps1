# Quarterdeck shell integration for Windows PowerShell / PowerShell 7.
# Emits OSC 133 (FinalTerm) sequences so the app can segment the stream
# into command blocks with real exit codes. The user's profile has already
# loaded by the time this runs (-NoExit -File).

$Global:__QdEsc = [char]27
$Global:__QdBel = [char]7
$Global:__QdFirstPrompt = $true

function Global:prompt {
  # Must be computed first, before anything in here changes $? / $LASTEXITCODE
  $__qdSuccess = $global:?
  $__qdNative = $global:LASTEXITCODE

  $ec = 0
  if (-not $__qdSuccess) {
    $ec = if (($__qdNative -is [int]) -and $__qdNative -ne 0) { $__qdNative } else { 1 }
  }

  $out = ''
  if (-not $Global:__QdFirstPrompt) {
    $out += "$Global:__QdEsc]133;D;$ec$Global:__QdBel"
  }
  $Global:__QdFirstPrompt = $false

  $out += "$Global:__QdEsc]133;A$Global:__QdBel"

  # Report the current directory (OSC 9;9, ConEmu style) so the app can show it
  # in the pane header. Only for real filesystem locations, not providers like
  # the registry or cert: drives.
  $loc = $executionContext.SessionState.Path.CurrentLocation
  if ($loc.Provider.Name -eq 'FileSystem') {
    $out += "$Global:__QdEsc]9;9;$($loc.ProviderPath)$Global:__QdBel"
  }

  $out += "PS $loc> "
  $out += "$Global:__QdEsc]133;B$Global:__QdBel"
  return $out
}

# Wrap PSReadLine so we can mark the moment a command starts executing (133;C).
$__qdHasPsrl = $false
try {
  $null = [Microsoft.PowerShell.PSConsoleReadLine]
  $__qdHasPsrl = $true
} catch {}

if ($__qdHasPsrl) {
  function Global:PSConsoleHostReadLine {
    $line = [Microsoft.PowerShell.PSConsoleReadLine]::ReadLine($Host.Runspace, $ExecutionContext)
    if (-not [string]::IsNullOrWhiteSpace($line)) {
      [Console]::Write("$Global:__QdEsc]133;C$Global:__QdBel")
    }
    return $line
  }
}
