param(
  [Parameter(Mandatory = $true)]
  [string]$Markdown,

  [Parameter(Mandatory = $true)]
  [string]$Output
)

$ErrorActionPreference = "Stop"

function Resolve-FullPath([string]$PathValue) {
  if ([System.IO.Path]::IsPathRooted($PathValue)) {
    return [System.IO.Path]::GetFullPath($PathValue)
  }
  return [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $PathValue))
}

function Xml-Escape([string]$Text) {
  if ($null -eq $Text) { return "" }
  return [System.Security.SecurityElement]::Escape($Text)
}

function Text-ForDoc([string]$Text) {
  if ($null -eq $Text) { return "" }
  $t = $Text
  $t = $t -replace '\*\*([^*]+)\*\*', '$1'
  $t = $t -replace '`([^`]+)`', '$1'
  $t = $t -replace '\[([^\]]+)\]\(([^)]+)\)', '$1 ($2)'
  return $t
}

function Add-TextParagraph {
  param(
    [System.Collections.Generic.List[string]]$Paragraphs,
    [string]$Text,
    [string]$Style = "Body",
    [int]$IndentTwips = 0
  )

  $clean = Xml-Escape (Text-ForDoc $Text)
  $styleXml = ""
  if ($Style -and $Style -ne "Body") {
    $styleXml = "<w:pStyle w:val=`"$Style`"/>"
  }
  $indentXml = ""
  if ($IndentTwips -gt 0) {
    $indentXml = "<w:ind w:left=`"$IndentTwips`" w:hanging=`"360`"/>"
  }
  $Paragraphs.Add("<w:p><w:pPr>$styleXml$indentXml</w:pPr><w:r><w:t xml:space=`"preserve`">$clean</w:t></w:r></w:p>")
}

function Add-ImageParagraph {
  param(
    [System.Collections.Generic.List[string]]$Paragraphs,
    [string]$RelationshipId,
    [string]$Name,
    [int64]$WidthEmu,
    [int64]$HeightEmu
  )

  $nameEsc = Xml-Escape $Name
  $Paragraphs.Add(@"
<w:p>
  <w:pPr><w:pStyle w:val="Image"/></w:pPr>
  <w:r>
    <w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0">
        <wp:extent cx="$WidthEmu" cy="$HeightEmu"/>
        <wp:effectExtent l="0" t="0" r="0" b="0"/>
        <wp:docPr id="$($Paragraphs.Count + 1)" name="$nameEsc"/>
        <wp:cNvGraphicFramePr>
          <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
        </wp:cNvGraphicFramePr>
        <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:nvPicPr>
                <pic:cNvPr id="0" name="$nameEsc"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="$RelationshipId"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm>
                  <a:off x="0" y="0"/>
                  <a:ext cx="$WidthEmu" cy="$HeightEmu"/>
                </a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>
</w:p>
"@)
}

function Ensure-Dir([string]$PathValue) {
  if (!(Test-Path -LiteralPath $PathValue)) {
    New-Item -ItemType Directory -Path $PathValue | Out-Null
  }
}

function Write-Utf8NoBom([string]$PathValue, [string]$Content) {
  [System.IO.File]::WriteAllText($PathValue, $Content, [System.Text.UTF8Encoding]::new($false))
}

$mdPath = Resolve-FullPath $Markdown
$outPath = Resolve-FullPath $Output
$mdDir = Split-Path -Parent $mdPath

if (!(Test-Path -LiteralPath $mdPath)) {
  throw "Markdown file not found: $mdPath"
}

$tmpRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("gmb-docx-" + [guid]::NewGuid().ToString("N"))
$docRoot = Join-Path $tmpRoot "docx"
$mediaDir = Join-Path $docRoot "word\media"
Ensure-Dir $docRoot
Ensure-Dir (Join-Path $docRoot "_rels")
Ensure-Dir (Join-Path $docRoot "word")
Ensure-Dir (Join-Path $docRoot "word\_rels")
Ensure-Dir $mediaDir

try {
  Add-Type -AssemblyName System.Drawing -ErrorAction SilentlyContinue
} catch {}

$paragraphs = [System.Collections.Generic.List[string]]::new()
$relationships = [System.Collections.Generic.List[string]]::new()
$relationships.Add('<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>')

$imageIndex = 0
$lines = [System.IO.File]::ReadAllLines($mdPath)
$inFence = $false

foreach ($line in $lines) {
  if ($line -match '^\s*```') {
    $inFence = -not $inFence
    continue
  }
  if ($inFence) {
    Add-TextParagraph -Paragraphs $paragraphs -Text $line -Style "Code"
    continue
  }
  if ($line.Trim().Length -eq 0) {
    Add-TextParagraph -Paragraphs $paragraphs -Text "" -Style "Body"
    continue
  }
  if ($line -match '^!\[([^\]]*)\]\(([^)]+)\)\s*$') {
    $alt = $matches[1]
    $relPath = $matches[2]
    $imgPath = if ([System.IO.Path]::IsPathRooted($relPath)) { $relPath } else { Join-Path $mdDir $relPath }
    $imgPath = [System.IO.Path]::GetFullPath($imgPath)
    if (Test-Path -LiteralPath $imgPath) {
      $imageIndex += 1
      $ext = [System.IO.Path]::GetExtension($imgPath).ToLowerInvariant()
      if ($ext -eq ".jpg") { $ext = ".jpeg" }
      $mediaName = "image$imageIndex$ext"
      Copy-Item -LiteralPath $imgPath -Destination (Join-Path $mediaDir $mediaName) -Force
      $rid = "rIdImage$imageIndex"
      $relationships.Add("<Relationship Id=`"$rid`" Type=`"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image`" Target=`"media/$mediaName`"/>")

      $widthPx = 1200
      $heightPx = 700
      try {
        $img = [System.Drawing.Image]::FromFile($imgPath)
        $widthPx = $img.Width
        $heightPx = $img.Height
        $img.Dispose()
      } catch {}
      $maxWidthEmu = [int64](6.45 * 914400)
      $widthEmu = [int64]($widthPx / 96 * 914400)
      $heightEmu = [int64]($heightPx / 96 * 914400)
      if ($widthEmu -gt $maxWidthEmu) {
        $scale = $maxWidthEmu / $widthEmu
        $widthEmu = [int64]$maxWidthEmu
        $heightEmu = [int64]($heightEmu * $scale)
      }
      Add-ImageParagraph -Paragraphs $paragraphs -RelationshipId $rid -Name $alt -WidthEmu $widthEmu -HeightEmu $heightEmu
      if ($alt) {
        Add-TextParagraph -Paragraphs $paragraphs -Text $alt -Style "Caption"
      }
    } else {
      Add-TextParagraph -Paragraphs $paragraphs -Text "[Missing screenshot: $relPath]" -Style "Caption"
    }
    continue
  }
  if ($line -match '^(#{1,6})\s+(.+)$') {
    $level = $matches[1].Length
    $style = if ($level -eq 1) { "Title" } elseif ($level -eq 2) { "Heading1" } elseif ($level -eq 3) { "Heading2" } else { "Heading3" }
    Add-TextParagraph -Paragraphs $paragraphs -Text $matches[2] -Style $style
    continue
  }
  if ($line -match '^\s*-\s+(.+)$') {
    Add-TextParagraph -Paragraphs $paragraphs -Text ("• " + $matches[1]) -Style "List" -IndentTwips 360
    continue
  }
  if ($line -match '^\s*(\d+)\.\s+(.+)$') {
    Add-TextParagraph -Paragraphs $paragraphs -Text ($matches[1] + ". " + $matches[2]) -Style "List" -IndentTwips 360
    continue
  }

  Add-TextParagraph -Paragraphs $paragraphs -Text $line -Style "Body"
}

$bodyXml = [string]::Join("`n", $paragraphs)
$relsXml = [string]::Join("`n", $relationships)

Write-Utf8NoBom (Join-Path $docRoot "[Content_Types].xml") @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>
"@

Write-Utf8NoBom (Join-Path $docRoot "_rels\.rels") @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
"@

Write-Utf8NoBom (Join-Path $docRoot "word\_rels\document.xml.rels") @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
$relsXml
</Relationships>
"@

Write-Utf8NoBom (Join-Path $docRoot "word\styles.xml") @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Body">
    <w:name w:val="Body"/>
    <w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/><w:color w:val="1F2A3A"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:pPr><w:spacing w:after="260"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display"/><w:b/><w:sz w:val="34"/><w:color w:val="001489"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="Heading 1"/>
    <w:pPr><w:spacing w:before="280" w:after="140"/><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display"/><w:b/><w:sz w:val="28"/><w:color w:val="001489"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="Heading 2"/>
    <w:pPr><w:spacing w:before="220" w:after="110"/><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display"/><w:b/><w:sz w:val="24"/><w:color w:val="001489"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="Heading 3"/>
    <w:pPr><w:spacing w:before="180" w:after="90"/><w:outlineLvl w:val="2"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display"/><w:b/><w:sz w:val="22"/><w:color w:val="001489"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="List">
    <w:name w:val="List"/>
    <w:pPr><w:spacing w:after="90" w:line="276" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/><w:color w:val="1F2A3A"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Caption">
    <w:name w:val="Caption"/>
    <w:pPr><w:spacing w:after="180"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:i/><w:sz w:val="18"/><w:color w:val="5C6B7A"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Code">
    <w:name w:val="Code"/>
    <w:pPr><w:spacing w:after="80"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="19"/><w:color w:val="1F2A3A"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Image">
    <w:name w:val="Image"/>
    <w:pPr><w:spacing w:before="120" w:after="80"/></w:pPr>
  </w:style>
</w:styles>
"@

Write-Utf8NoBom (Join-Path $docRoot "word\document.xml") @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
$bodyXml
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>
"@

if (Test-Path -LiteralPath $outPath) {
  Remove-Item -LiteralPath $outPath -Force
}
Ensure-Dir (Split-Path -Parent $outPath)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($outPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem -LiteralPath $docRoot -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($docRoot.Length).TrimStart('\', '/') -replace '\\', '/'
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel) | Out-Null
  }
} finally {
  $zip.Dispose()
}

Remove-Item -LiteralPath $tmpRoot -Recurse -Force
Write-Host "Wrote $outPath"
