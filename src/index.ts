#!/usr/bin/env node

import { Answers, Package, Step } from "./declarations/types";
import { execSync } from "child_process";
import fs from "fs-extra";
import path from "path";
import prompts from "prompts";
import validateName from "validate-npm-package-name";

const getApplicationId = (token: string): string | null => {
  try {
    const response: string = execSync(
      `curl -s -X GET -H "Authorization: Bot ${token}" "https://discordapp.com/api/oauth2/applications/@me"`
    ).toString();
    const parsedResponse = JSON.parse(response);

    return parsedResponse.id || null;
  } catch (error) {
    return null;
  }
};

const appDirectory: string = path.join(__dirname, "../app");
const appPackage: Package = require(path.join(appDirectory, "package.json"));

const { name, version }: Package = require(path.join(
  __dirname,
  "../package.json"
));
const utilityNameAndVersion = `${name} v${version}`;

console.log(`This utility will walk you through creating a ${name} application.

Press ENTER to use the default.
Press ^C at any time to quit.

${utilityNameAndVersion}`);

const questions: prompts.PromptObject<string>[] = [
  {
    type: "text",
    name: "name",
    initial: appPackage.name,
    validate: (name) => {
      const { validForNewPackages, errors, warnings } = validateName(name);
      return (
        validForNewPackages || `Error: ${(errors || warnings).join(", ")}.`
      );
    },
    message: "Application name?",
  },
  {
    type: "password",
    name: "token",
    initial: "DISCORD_BOT_TOKEN_PLACEHOLDER",
    message: "Discord bot token?",
  },
];
prompts(questions)
  .then(async ({ name, token }: Answers) => {
    console.log();
    const directory: string = path.resolve(name);

    const updateSteps: Step[] = [
      {
        message: `Updating core files in '${name}'...`,
        action: () => {
          fs.copySync(`${appDirectory}/src/core`, `${directory}/src/core`);
          fs.copySync(
            `${appDirectory}/src/index.js`,
            `${directory}/src/index.js`
          );
        },
      },
    ];
    const cleanInstallSteps: Step[] = [
      {
        message: `Creating directory '${name}'...`,
        action: () => fs.mkdirSync(directory),
      },
      {
        message: "Creating boilerplate...",
        action: () => {
          fs.copySync(appDirectory, directory);
          fs.writeFileSync(
            path.join(directory, ".gitignore"),
            "node_modules/\ntoken.json\n"
          );
        },
      },
      {
        message: "Updating package.json...",
        action: () => {
          const description = `Generated by ${utilityNameAndVersion}.`;
          fs.writeFileSync(
            path.join(directory, "package.json"),
            `${JSON.stringify({ ...appPackage, name, description }, null, 2)}\n`
          );
        },
      },
      {
        message: "Writing token.json...",
        action: () =>
          fs.writeFileSync(
            path.join(directory, "token.json"),
            `${JSON.stringify({ token }, null, 2)}\n`
          ),
      },
      {
        message: "Installing modules...",
        action: () => {
          process.chdir(directory);
          execSync("npm ci --loglevel=error");
        },
      },
    ];
    let steps: Step[];

    const isUpdate = fs.existsSync(directory);
    if (isUpdate) {
      const updateAnswer = await prompts([
        {
          type: "confirm",
          name: "update",
          message: `Directory '${directory}' already exists. Do you want to update it?`,
        },
      ]);
      console.log();

      if (!updateAnswer.update) {
        throw `Error: '${directory}' already exists.\nQuitting...`;
      }

      steps = updateSteps;
    } else {
      steps = cleanInstallSteps;
    }

    const [, , ...args] = process.argv;
    const isDryRun: boolean = args[0] === "--dry-run";

    steps.forEach(({ message, action }) => {
      console.log(message);
      if (!isDryRun) {
        action();
      }
    });

    if (!isUpdate) {
      console.log();
      console.log("Generating bot invite link...");
      const applicationId = getApplicationId(token);
      console.log(
        applicationId
          ? `Invite your bot: https://discordapp.com/oauth2/authorize?scope=bot&client_id=${applicationId}`
          : "Bot invite link was not generated due to the given bot token being invalid."
      );
      console.log();
    }

    console.log(`Done!\n\nStart by running:\n\t$ cd ${name}/\n\t$ npm start`);

    process.exit(0);
  })
  .catch(console.error);
