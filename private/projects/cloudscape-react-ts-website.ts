/*! Copyright [Amazon.com](http://amazon.com/), Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0 */
import { Project } from "projen";
import { Stability } from "projen/lib/cdk";
import { NodePackageManager } from "projen/lib/javascript";
import { ReactTypeScriptProject } from "projen/lib/web";
import { JEST_VERSION } from "./pdk-monorepo-project";
import { buildExecutableCommand } from "../../packages/nx-monorepo/src";
import { PDKProject } from "../pdk-project";

/**
 * Contains configuration for the CloudscapeReactTsWebsiteProject.
 */
export class CloudscapeReactTsWebsiteProject extends PDKProject {
  public sampleProject: Project;

  constructor(parent: Project) {
    super({
      parent,
      author: "AWS APJ COPE",
      authorAddress: "apj-cope@amazon.com",
      defaultReleaseBranch: "mainline",
      name: "cloudscape-react-ts-website",
      keywords: ["aws", "pdk", "jsii", "projen"],
      repositoryUrl: "https://github.com/aws/aws-prototyping-sdk",
      devDeps: ["projen"],
      peerDeps: ["projen"],
      stability: Stability.EXPERIMENTAL,
    });

    this.sampleProject = new CloudscapeReactTsSampleWebsiteProject(parent);
  }
}

/**
 * Nested CloudscapeReactTsSampleWebsiteProject configuration.
 */
class CloudscapeReactTsSampleWebsiteProject extends ReactTypeScriptProject {
  constructor(parent: Project) {
    super({
      parent,
      packageManager: NodePackageManager.PNPM,
      projenCommand: buildExecutableCommand(NodePackageManager.PNPM, "projen"),
      outdir: "packages/cloudscape-react-ts-website/samples",
      defaultReleaseBranch: "mainline",
      depsUpgrade: false,
      name: "@aws-prototyping-sdk/cloudscape-react-ts-sample-website",
      sampleCode: false,
      jestOptions: {
        jestVersion: JEST_VERSION,
      },
      devDeps: ["@babel/plugin-proposal-private-property-in-object"],
      deps: [
        "@cloudscape-design/global-styles",
        "@cloudscape-design/components",
        "@cloudscape-design/collection-hooks",
        "react-router-dom",
        "@aws-amplify/core",
        "@aws-amplify/auth",
        "aws-amplify",
        "@aws-amplify/ui-react",
        "aws4fetch",
      ],
      gitignore: ["runtime-config.json"],
    });

    this.npmignore?.include("src", "public");
    this.package.addField("private", true);
    this.testTask.reset(
      "react-scripts test --watchAll=false --passWithNoTests"
    );
  }
}
