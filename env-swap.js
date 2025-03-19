#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import inquirer from "inquirer";
import chalk from "chalk";

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to find the .env file
async function findEnvFile() {
  // First, check current directory
  const currentDir = process.cwd();
  const envPath = path.join(currentDir, ".env");

  if (fs.existsSync(envPath)) {
    return envPath;
  }

  // If not found, try to find git root
  try {
    const gitRoot = execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
    }).trim();
    const gitRootEnvPath = path.join(gitRoot, ".env");

    if (fs.existsSync(gitRootEnvPath)) {
      return gitRootEnvPath;
    }
  } catch (error) {
    // Not a git repository or git command failed
  }

  return null;
}

// Parse the .env file to find environment blocks
function parseEnvFile(content) {
  const lines = content.split("\n");
  const blocks = [{ name: "(default)", startLine: 0, endLine: 0, lines: [] }];
  let currentBlock = blocks[0];

  lines.forEach((line, index) => {
    // Check if line is a section header (starts with ## )
    if (line.trim().startsWith("## ")) {
      // Save the previous block's end line
      currentBlock.endLine = index - 1;

      // Create a new block
      const blockName = line.trim().substring(3);
      currentBlock = {
        name: blockName,
        startLine: index,
        endLine: lines.length - 1, // Will be updated when next block is found
        lines: [],
      };
      blocks.push(currentBlock);
    } else {
      // Add line to current block
      currentBlock.lines.push({
        text: line,
        lineNumber: index,
        isComment: line.trim().startsWith("#") && !line.trim().startsWith("##"),
        isEnvVariable:
          /^\s*[A-Za-z0-9_]+=.*$/.test(line) ||
          /^\s*#\s*[A-Za-z0-9_]+=.*$/.test(line),
      });
    }
  });

  return blocks;
}

// Determine which blocks are currently active
function detectActiveBlocks(blocks) {
  // A block is considered "active" if at least one of its variables is uncommented
  return blocks
    .filter((block) => {
      const envVars = block.lines.filter((line) => line.isEnvVariable);
      return envVars.some((line) => !line.isComment);
    })
    .map((block) => block.name);
}

// Update the .env file based on selected blocks
function updateEnvFile(envPath, blocks, selectedBlockNames) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n");

  // Process each block
  blocks.forEach((block) => {
    const isSelected = selectedBlockNames.includes(block.name);

    // Only modify env variable lines
    block.lines.forEach((line) => {
      if (line.isEnvVariable) {
        const originalLine = lines[line.lineNumber];

        if (isSelected && line.isComment) {
          // Uncomment this line
          lines[line.lineNumber] = originalLine.replace(/^\s*#\s*/, "");
        } else if (!isSelected && !line.isComment) {
          // Comment out this line
          lines[line.lineNumber] = "# " + originalLine;
        }
      }
    });
  });

  // Write updated content back to file
  fs.writeFileSync(envPath, lines.join("\n"));
}

// Revert the .env file using git
function revertEnvFile(envPath) {
  try {
    const relativePath = path.relative(process.cwd(), envPath);
    execSync(`git checkout -- "${relativePath}"`, { stdio: "inherit" });
    return true;
  } catch (error) {
    console.error("Failed to revert file:", error.message);
    return false;
  }
}

async function main() {
  try {
    const envPath = await findEnvFile();

    if (!envPath) {
      console.error(
        chalk.red("No .env file found in current directory or git root.")
      );
      process.exit(1);
    }

    console.log(chalk.blue(`Found .env file at: ${envPath}`));

    const content = fs.readFileSync(envPath, "utf8");
    const blocks = parseEnvFile(content);
    const activeBlocks = detectActiveBlocks(blocks);

    // Prepare choices for the multiselect prompt
    const choices = blocks.map((block) => ({
      name: block.name,
      checked: activeBlocks.includes(block.name),
    }));

    // Add a separator and a revert option
    choices.push(new inquirer.Separator());
    choices.push({
      name: "REVERT TO ORIGINAL",
      value: "revert",
      checked: false,
    });

    const answers = await inquirer.prompt([
      {
        type: "checkbox",
        name: "selectedBlocks",
        message: "Select environment blocks to activate:",
        choices: choices,
        pageSize: Math.min(15, choices.length + 2),
      },
    ]);

    if (answers.selectedBlocks.includes("revert")) {
      // Handle revert option
      const confirmRevert = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message:
            "Are you sure you want to revert the file to its original state?",
          default: false,
        },
      ]);

      if (confirmRevert.confirm) {
        if (revertEnvFile(envPath)) {
          console.log(chalk.green("File has been reverted successfully."));
        }
      }
    } else {
      // Apply selected blocks
      updateEnvFile(envPath, blocks, answers.selectedBlocks);
      console.log(chalk.green("Environment blocks updated successfully."));
    }
  } catch (error) {
    console.error(chalk.red("Error:"), error);
    process.exit(1);
  }
}

// Run the main function
main();
