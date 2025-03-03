/*! Copyright [Amazon.com](http://amazon.com/), Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0 */
import * as path from "path";
import { exec } from "projen/lib/util";
import { GeneratedTypescriptRuntimeProject } from "../../../src/project/codegen/runtime/generated-typescript-runtime-project";
import { withTmpDirSnapshot } from "../../project/snapshot-utils";

describe("Typescript Client Code Generation Script Unit Tests", () => {
  it.each(["single.yaml", "multiple-tags.yaml"])(
    "Generates With %s",
    (spec) => {
      const specPath = path.resolve(__dirname, `../../resources/specs/${spec}`);

      expect(
        withTmpDirSnapshot(
          path.resolve(__dirname),
          (outdir) => {
            const project = new GeneratedTypescriptRuntimeProject({
              name: "test",
              defaultReleaseBranch: "main",
              outdir,
              specPath: path.relative(outdir, specPath),
            });
            const command = project.buildGenerateCommand();
            exec(command.command, {
              cwd: command.workingDir,
            });
          },
          {
            excludeGlobs:
              GeneratedTypescriptRuntimeProject.openApiIgnorePatterns,
          }
        )
      ).toMatchSnapshot();
    }
  );
});
