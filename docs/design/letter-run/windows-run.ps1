# Priya's letter at three sizes on a Windows machine (Book 1 letter run).
#
# Needs: Ollama for Windows installed and running (ollama.com), and materials.md
# in the same folder as this script. Installs nothing else and changes nothing
# on the machine except the models Ollama downloads.
#
# Run in PowerShell, from this folder:
#   powershell -ExecutionPolicy Bypass -File .\windows-run.ps1
# It writes letter-run-<computer name>.json here. Send that file back.

param(
    [string]$Ollama = "http://127.0.0.1:11434",
    [string[]]$Models = @("qwen3:0.6b", "qwen3:8b", "qwen3:32b")
)

$ErrorActionPreference = "Stop"
$RunCount = 3  # PowerShell names ignore case, so this must not be called $Runs
$Temperature = 0.7
$TimeoutSeconds = 1800
$GB = 1GB
# File sizes Ollama reports for these models (measured 2026-11-05), so a model
# that can't fit is skipped before it is downloaded.
$FileGB = @{ "qwen3:0.6b" = 0.5; "qwen3:8b" = 5.2; "qwen3:32b" = 20.0 }

function Get-Machine {
    $info = [ordered]@{ name = [Environment]::MachineName; os = [Environment]::OSVersion.VersionString }
    try {
        $cs = Get-CimInstance Win32_ComputerSystem
        $info.normal_memory_gb = [math]::Round($cs.TotalPhysicalMemory / $GB, 1)
        $info.processor = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
        $info.graphics = @(Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name })
    } catch {
        # Not Windows (the script is tested on a Mac and Linux): read memory another way.
        if (Test-Path /proc/meminfo) {
            $kb = (Select-String -Path /proc/meminfo -Pattern '^MemTotal:\s+(\d+)').Matches[0].Groups[1].Value
            $info.normal_memory_gb = [math]::Round([double]$kb * 1KB / $GB, 1)
        } elseif (Get-Command sysctl -ErrorAction SilentlyContinue) {
            $info.normal_memory_gb = [math]::Round([double](& sysctl -n hw.memsize) / $GB, 1)
        }
    }
    $info.graphics_card_memory_gb = 0
    $smi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
    if ($smi) {
        $line = & nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits | Select-Object -First 1
        $parts = $line -split ","
        $info.graphics_card = $parts[0].Trim()
        $info.graphics_card_memory_gb = [math]::Round([double]$parts[1].Trim() / 1024, 1)
    }
    return $info
}

function Get-Prompt {
    $m = Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot "materials.md")
    $request = ($m -split [regex]::Escape("## The request (Priya's words, from chapter 0)"))[1]
    $request = ($request -split "##")[0].Trim()
    $rest = ($m -split [regex]::Escape("## Extract from the tenancy agreement"))[1]
    return "$request`n`nHere are the papers.`n`n## Extract from the tenancy agreement$rest"
}

function Invoke-Ollama($path, $body) {
    $json = $body | ConvertTo-Json -Depth 6
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    return Invoke-RestMethod -Uri ($Ollama + $path) -Method Post -Body $bytes -ContentType "application/json; charset=utf-8" -TimeoutSec $TimeoutSeconds
}

function Invoke-Letter($model, $seed, $prompt, $options) {
    $started = Get-Date
    $r = Invoke-Ollama "/api/chat" @{ model = $model; stream = $false; think = $false; messages = @(@{ role = "user"; content = $prompt }); options = $options }
    $wall = ((Get-Date) - $started).TotalSeconds
    $ps = Invoke-RestMethod -Uri ($Ollama + "/api/ps") -TimeoutSec 30
    $loaded = $ps.models | Where-Object { $_.name -eq $model } | Select-Object -First 1
    return [ordered]@{
        seed = $seed
        letter = $r.message.content
        wall_s = [math]::Round($wall, 2)
        load_s = [math]::Round($r.load_duration / 1e9, 2)
        first_word_s = [math]::Round(($r.load_duration + $r.prompt_eval_duration) / 1e9, 2)
        words_out = ($r.message.content -split "\s+" | Where-Object { $_ }).Count
        tokens_out = $r.eval_count
        tokens_per_s = [math]::Round($r.eval_count / ($r.eval_duration / 1e9), 1)
        memory_gb = if ($loaded) { [math]::Round($loaded.size / $GB, 1) } else { $null }
        on_graphics_card_gb = if ($loaded) { [math]::Round($loaded.size_vram / $GB, 1) } else { $null }
    }
}

$machine = Get-Machine
if (-not $machine.normal_memory_gb) { throw "Couldn't read this machine's memory, so I can't tell which models fit. Nothing was run." }
$roomGB = $machine.normal_memory_gb + $machine.graphics_card_memory_gb
$prompt = Get-Prompt
$results = @()
foreach ($model in $Models) {
    Write-Host "== $model"
    if (-not $FileGB.ContainsKey($model)) { throw "No known file size for $model; add it to `$FileGB first." }
    if ($FileGB[$model] -gt $roomGB) {
        $results += [ordered]@{ model = $model; skipped = "the $($FileGB[$model]) GB file is bigger than this machine's $roomGB GB of memory" }
        Write-Host "   skipped: doesn't fit"
        continue
    }
    Invoke-Ollama "/api/pull" @{ model = $model; stream = $false } | Out-Null
    $runs = @()
    foreach ($seed in 1..$RunCount) {
        Write-Host "   run $seed"
        $runs += Invoke-Letter $model $seed $prompt @{ seed = $seed; temperature = $Temperature }
    }
    $entry = [ordered]@{ model = $model; runs = $runs }
    if ($machine.graphics_card_memory_gb -gt 0) {
        Write-Host "   once more, processor only"
        $entry.processor_only = Invoke-Letter $model 1 $prompt @{ seed = 1; temperature = $Temperature; num_gpu = 0 }
    }
    $results += $entry
    Invoke-Ollama "/api/generate" @{ model = $model; keep_alive = 0 } | Out-Null
}

$out = Join-Path $PSScriptRoot ("letter-run-" + $machine.name + ".json")
[ordered]@{ machine = $machine; results = $results } | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $out
Write-Host "Done. Send this file back: $out"
