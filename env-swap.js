#!/usr/bin/env node

const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")
const blessed = require("blessed")

// Helper to find the .env file
async function findEnvFile() {
  // First, check current directory
  const currentDir = process.cwd()
  const envPath = path.join(currentDir, ".env")

  if (fs.existsSync(envPath)) {
    return envPath
  }

  // If not found, try to find git root
  try {
    const gitRoot = execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
    }).trim()
    const gitRootEnvPath = path.join(gitRoot, ".env")

    if (fs.existsSync(gitRootEnvPath)) {
      return gitRootEnvPath
    }
  } catch (error) {
    // Not a git repository or git command failed
  }

  return null
}

// Parse the .env file to find environment blocks
function parseEnvFile(content) {
  const lines = content.split("\n")
  const blocks = [{ name: "(default)", startLine: 0, endLine: 0, lines: [] }]
  let currentBlock = blocks[0]

  lines.forEach((line, index) => {
    // Check if line is a section header (starts with ## )
    if (line.trim().startsWith("## ")) {
      // Save the previous block's end line
      currentBlock.endLine = index - 1

      // Create a new block
      const blockName = line.trim().substring(3)
      currentBlock = {
        name: blockName,
        startLine: index,
        endLine: lines.length - 1, // Will be updated when next block is found
        lines: [],
      }
      blocks.push(currentBlock)
    } else {
      // Add line to current block
      currentBlock.lines.push({
        text: line,
        lineNumber: index,
        isComment: line.trim().startsWith("#") && !line.trim().startsWith("##"),
        isEnvVariable:
          /^\s*[A-Za-z0-9_]+=.*$/.test(line) ||
          /^\s*#\s*[A-Za-z0-9_]+=.*$/.test(line),
      })
    }
  })

  return blocks
}

// Update the .env file based on selected blocks
function updateEnvFile(envPath, blocks, selectedBlockNames) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n")

  // Process each block
  blocks.forEach((block) => {
    const isSelected = selectedBlockNames.includes(block.name)

    // Only modify env variable lines
    block.lines.forEach((line) => {
      if (line.isEnvVariable) {
        const originalLine = lines[line.lineNumber]

        if (isSelected && line.isComment) {
          // Uncomment this line
          lines[line.lineNumber] = originalLine.replace(/^\s*#\s*/, "")
        } else if (!isSelected && !line.isComment) {
          // Comment out this line
          lines[line.lineNumber] = "# " + originalLine
        }
      }
    })
  })

  // Write updated content back to file
  fs.writeFileSync(envPath, lines.join("\n"))
}

// Revert the .env file using git
function revertEnvFile(envPath) {
  try {
    const relativePath = path.relative(process.cwd(), envPath)
    execSync(`git checkout -- "${relativePath}"`, { stdio: "inherit" })
    return true
  } catch (error) {
    console.error("Failed to revert file:", error.message)
    return false
  }
}

async function main() {
  const envPath = await findEnvFile()

  if (!envPath) {
    console.error("No .env file found in current directory or git root.")
    process.exit(1)
  }

  const content = fs.readFileSync(envPath, "utf8")
  const blocks = parseEnvFile(content)

  // Create blessed screen
  const screen = blessed.screen({
    smartCSR: true,
    title: "env-swap",
  })

  // Create a box for the UI
  const box = blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    content: `Found .env file at: ${envPath}\n\nSelect environment blocks to activate (space to toggle, enter to apply):`,
    tags: true,
    border: {
      type: "line",
    },
    style: {
      fg: "white",
      border: {
        fg: "blue",
      },
    },
  })

  // Create a list for block selection
  const list = blessed.list({
    parent: box,
    top: 4,
    left: 2,
    width: "90%",
    height: blocks.length + 2,
    items: blocks.map((block) => `[ ] ${block.name}`),
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    border: {
      type: "line",
    },
    style: {
      item: {
        fg: "white",
      },
      selected: {
        fg: "green",
        bg: "black",
      },
      border: {
        fg: "blue",
      },
    },
  })

  // Add a special revert option at the bottom
  list.add("=== REVERT TO ORIGINAL ===")

  // Add a help text
  const helpText = blessed.text({
    parent: box,
    bottom: 2,
    left: "center",
    content:
      "Space: Toggle selection | Enter: Apply changes | R: Revert (when on revert option) | Esc/q: Quit",
    tags: true,
    style: {
      fg: "yellow",
    },
  })

  // Status message area
  const statusMessage = blessed.text({
    parent: box,
    bottom: 0,
    left: "center",
    content: "",
    tags: true,
    style: {
      fg: "green",
    },
  })

  // Determine which blocks are currently active by checking if their variables are uncommented
  function detectActiveBlocks() {
    // A block is considered "active" if at least one of its variables is uncommented
    return blocks
      .filter((block) => {
        const envVars = block.lines.filter((line) => line.isEnvVariable)
        return envVars.some((line) => !line.isComment)
      })
      .map((block) => block.name)
  }

  // Track selected blocks - initialize with currently active blocks
  const activeBlocks = detectActiveBlocks()
  const selectedBlocks = new Set(activeBlocks)

  // Update initial list items to show current state
  blocks.forEach((block, index) => {
    const isSelected = selectedBlocks.has(block.name)
    list.setItem(index, `[${isSelected ? "x" : " "}] ${block.name}`)
  })

  // Handle list selection - now it just focuses on the item without toggling
  list.on("select", (item, index) => {
    // Do nothing on selection - we'll handle toggling with space key
    // and applying with enter key separately
  })

  // Handle key presses for toggling with space
  list.key("space", () => {
    const index = list.selected

    if (index < blocks.length) {
      const blockName = blocks[index].name
      const isSelected = selectedBlocks.has(blockName)

      if (isSelected) {
        selectedBlocks.delete(blockName)
        list.setItem(index, `[ ] ${blockName}`)
      } else {
        selectedBlocks.add(blockName)
        list.setItem(index, `[x] ${blockName}`)
      }

      screen.render()
    }
  })

  // Handle enter key to apply changes without selecting/toggling
  list.key("enter", () => {
    // Apply selected blocks
    updateEnvFile(envPath, blocks, Array.from(selectedBlocks))
    statusMessage.setContent(
      "{green-fg}Environment blocks updated successfully.{/green-fg}",
    )
    screen.render()

    // Exit after a delay
    setTimeout(() => process.exit(0), 1500)
  })

  // Add a separate handler for handling the revert option
  list.key(["r", "R"], () => {
    if (list.selected === blocks.length) {
      // Only trigger revert if the revert option is selected
      if (revertEnvFile(envPath)) {
        statusMessage.setContent(
          "{green-fg}File has been reverted successfully.{/green-fg}",
        )
        screen.render()

        // Exit after a delay
        setTimeout(() => process.exit(0), 1500)
      }
    }
  })

  // Quit on Escape, q, or Control-C
  screen.key(["escape", "q", "C-c"], () => process.exit(0))

  // Append our box to the screen
  screen.append(box)

  // Focus on the list
  list.focus()

  // Render the screen
  screen.render()
}

// Run the main function
main().catch((err) => {
  console.error("Error:", err)
  process.exit(1)
})
