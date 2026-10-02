# install-v5-tools.ps1 — Install OSS tools for the v5 pipeline.
#
# These tools replace LLM usage with deterministic verification:
#   egglog       — e-graph rewriting (replaces LLM optimization)
#   proptest     — property-based testing (replaces LLM test synthesis)
#   cvc5         — SMT solving (replaces LLM verification)
#   tree-sitter  — AST transformation (replaces LLM fix proposals)
#   cargo-mutants— mutation testing (replaces LLM mutant proposal)
#
# Run as administrator: powershell -ExecutionPolicy Bypass -File install-v5-tools.ps1

$ErrorActionPreference = "Stop"
$toolsDir = "C:\Users\User\Downloads\BUSINESS\INFRASTRUCTURE\v5-tools"
New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null

Write-Host "=== v5 OSS Tools Installer ===" -ForegroundColor Cyan
Write-Host ""

# --- Check prerequisites ---
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

# Cargo (Rust)
$cargo = Get-Command cargo -ErrorAction SilentlyContinue
if (-not $cargo) {
    Write-Host "  cargo not found. Installing Rust..." -ForegroundColor Yellow
    $rustup = "$env:USERPROFILE\.cargo\bin\rustup.exe"
    if (-not (Test-Path $rustup)) {
        Invoke-WebRequest -Uri "https://win.rustup.com/x86_64" -OutFile "$env:TEMP\rustup-init.exe"
        & "$env:TEMP\rustup-init.exe" -y
        $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
    }
    $cargo = Get-Command cargo -ErrorAction SilentlyContinue
}
if ($cargo) {
    Write-Host "  cargo: $($cargo.Source)" -ForegroundColor Green
} else {
    Write-Host "  cargo: NOT FOUND (install Rust manually)" -ForegroundColor Red
}

# Node.js
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    Write-Host "  node: $($node.Source)" -ForegroundColor Green
} else {
    Write-Host "  node: NOT FOUND" -ForegroundColor Red
}

Write-Host ""

# --- Install Rust-based tools ---
Write-Host "Installing Rust-based tools..." -ForegroundColor Yellow

# egglog — e-graph rewriting
Write-Host "  Installing egglog..." -ForegroundColor Yellow
& cargo install --locked egglog 2>&1 | Out-Null
if ($?) { Write-Host "    egglog: installed" -ForegroundColor Green }
else { Write-Host "    egglog: FAILED" -ForegroundColor Red }

# tree-sitter-cli — AST transformation
Write-Host "  Installing tree-sitter-cli..." -ForegroundColor Yellow
& cargo install --locked tree-sitter-cli 2>&1 | Out-Null
if ($?) { Write-Host "    tree-sitter-cli: installed" -ForegroundColor Green }
else { Write-Host "    tree-sitter-cli: FAILED" -ForegroundColor Red }

# cargo-mutants — mutation testing
Write-Host "  Installing cargo-mutants..." -ForegroundColor Yellow
& cargo install --locked cargo-mutants 2>&1 | Out-Null
if ($?) { Write-Host "    cargo-mutants: installed" -ForegroundColor Green }
else { Write-Host "    cargo-mutants: FAILED" -ForegroundColor Red }

Write-Host ""

# --- Install cvc5 (pre-built Windows binary) ---
Write-Host "Installing cvc5..." -ForegroundColor Yellow
$cvc5Dir = "$toolsDir\cvc5"
if (-not (Test-Path "$cvc5Dir\bin\cvc5.exe")) {
    New-Item -ItemType Directory -Force -Path $cvc5Dir | Out-Null
    $cvc5Url = "https://github.com/cvc5/cvc5/releases/download/cvc5-1.3.4/cvc5-Win64-x86_64-static.zip"
    $cvc5Zip = "$env:TEMP\cvc5.zip"
    Write-Host "  Downloading cvc5..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $cvc5Url -OutFile $cvc5Zip
    Write-Host "  Extracting cvc5..." -ForegroundColor Yellow
    Expand-Archive -Path $cvc5Zip -DestinationPath $cvc5Dir -Force
    Remove-Item $cvc5Zip
    # Find the cvc5.exe in the extracted structure
    $cvc5Exe = Get-ChildItem -Path $cvc5Dir -Recurse -Filter "cvc5.exe" | Select-Object -First 1
    if ($cvc5Exe) {
        $cvc5Bin = "$cvc5Dir\bin"
        New-Item -ItemType Directory -Force -Path $cvc5Bin | Out-Null
        Copy-Item $cvc5Exe.FullName "$cvc5Bin\cvc5.exe"
        # Copy DLLs
        $cvc5Lib = Get-ChildItem -Path $cvc5Exe.Directory -Filter "*.dll"
        foreach ($dll in $cvc5Lib) {
            Copy-Item $dll.FullName "$cvc5Bin\$($dll.Name)"
        }
        Write-Host "    cvc5: installed at $cvc5Bin" -ForegroundColor Green
    } else {
        Write-Host "    cvc5: FAILED (cvc5.exe not found in archive)" -ForegroundColor Red
    }
} else {
    Write-Host "    cvc5: already installed" -ForegroundColor Green
}

Write-Host ""

# --- Install proptest (via cargo) ---
Write-Host "Installing proptest..." -ForegroundColor Yellow
$proptestDir = "$toolsDir\proptest"
if (-not (Test-Path $proptestDir)) {
    New-Item -ItemType Directory -Force -Path $proptestDir | Out-Null
    Push-Location $proptestDir
    & cargo init --name proptest 2>&1 | Out-Null
    Add-Content -Path "Cargo.toml" -Value "`n[dev-dependencies]`nproptest = `"1.11.0`""
    & cargo build 2>&1 | Out-Null
    Pop-Location
    if ($?) { Write-Host "    proptest: installed at $proptestDir" -ForegroundColor Green }
    else { Write-Host "    proptest: FAILED" -ForegroundColor Red }
} else {
    Write-Host "    proptest: already installed" -ForegroundColor Green
}

Write-Host ""

# --- Summary ---
Write-Host "=== Installation Summary ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Tools installed:" -ForegroundColor Yellow
Write-Host "  egglog        — e-graph rewriting (cargo install)" -ForegroundColor White
Write-Host "  tree-sitter   — AST transformation (cargo install)" -ForegroundColor White
Write-Host "  cargo-mutants — mutation testing (cargo install)" -ForegroundColor White
Write-Host "  cvc5          — SMT solving ($cvc5Dir\bin)" -ForegroundColor White
Write-Host "  proptest      — property-based testing ($proptestDir)" -ForegroundColor White
Write-Host ""
Write-Host "Add to PATH:" -ForegroundColor Yellow
Write-Host "  $env:USERPROFILE\.cargo\bin" -ForegroundColor White
Write-Host "  $cvc5Dir\bin" -ForegroundColor White
Write-Host ""
Write-Host "Kind 2 (contract checking) requires WSL2 on Windows." -ForegroundColor Yellow
Write-Host "  Install WSL2: wsl --install" -ForegroundColor White
Write-Host "  Then in WSL: opam install kind2" -ForegroundColor White
Write-Host ""
Write-Host "Next: run the v5 pipeline with these tools wired in." -ForegroundColor Cyan
