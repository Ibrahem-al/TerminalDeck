; Custom NSIS hook for TerminalDeck.
; On install start, detect a previous installation and let the user choose to
; remove the old version first. App data (settings, paired phones) is preserved
; because the uninstaller is run without deleteAppDataOnUninstall.
; electron-builder auto-includes build/installer.nsh and calls customInit in .onInit.

!macro customInit
  Push $R0
  Push $R1

  ; UninstallString lives under UNINSTALL_REGISTRY_KEY; InstallLocation under
  ; INSTALL_REGISTRY_KEY. Check per-user (HKCU) first, then per-machine (HKLM).
  ReadRegStr $R0 HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  ReadRegStr $R1 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  StrCmp $R0 "" 0 rd_have_old
    ReadRegStr $R0 HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    ReadRegStr $R1 HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation"
    StrCmp $R0 "" rd_done

  rd_have_old:
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "An existing version of ${PRODUCT_NAME} is already installed.$\r$\n$\r$\nDo you want to remove the old version before installing this update?$\r$\n$\r$\n(Recommended. Your settings and paired phones are kept.)" \
      /SD IDYES IDNO rd_done

    StrCmp $R1 "" rd_uninst_nopath rd_uninst_path
    rd_uninst_path:
      ; _?= keeps the uninstaller in place so ExecWait actually waits for it
      ExecWait '"$R0" /S _?=$R1'
      Goto rd_cleanup
    rd_uninst_nopath:
      ExecWait '"$R0" /S'
    rd_cleanup:
      Delete "$R0"

  rd_done:
  Pop $R1
  Pop $R0
!macroend
