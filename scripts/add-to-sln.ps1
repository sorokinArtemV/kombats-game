# to run:
# 1. Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
# .\add-to-sln.ps1
# 2. .\add-to-sln.ps1

param (
    [string]$SolutionPath = "Kombats.slnx",
    [string]$RootPath = ".\src"
)

if (!(Test-Path $SolutionPath)) {
    throw "Solution not found: $SolutionPath"
}

$rootFullPath = (Resolve-Path $RootPath).Path
$projects = Get-ChildItem -Path $RootPath -Recurse -Filter *.csproj

foreach ($proj in $projects) {
    $projPath = $proj.FullName

    $relativePath = $projPath.Substring($rootFullPath.Length).TrimStart('\','/')
    $topFolder = ($relativePath -split '[\\/]+')[0]

    switch ($topFolder) {
        "Kombats.Battle" {
            $folder = "Battle"
            break
        }
        "Kombats.Matchmaking" {
            $folder = "Matchmaking"
            break
        }
        "Kombats.Players" {
            $folder = "Players"
            break
        }
        "Kombats.Common" {
            $folder = "Common"
            break
        }
        "Kombats.Infrastructure.Messaging" {
            $folder = "Common"
            break
        }
        default {
            $folder = "Other"
            break
        }
    }

    Write-Host "Adding $projPath -> $folder"

    $result = dotnet sln $SolutionPath add $projPath --solution-folder $folder 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK]"
    }
    else {
        if ($result -match "already exists") {
            Write-Host "[SKIP] already added"
        }
        else {
            Write-Host "[ERR]"
            Write-Host $result
        }
    }
}

Write-Host "Done."