/*! Copyright [Amazon.com](http://amazon.com/), Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0 */
import * as path from "path";
import {
  Dependency,
  DependencyType,
  IgnoreFile,
  JsonFile,
  Project,
  Task,
  YamlFile,
} from "projen";
import { JavaProject } from "projen/lib/java";
import {
  NodePackage,
  NodePackageManager,
  NodeProject,
} from "projen/lib/javascript";
import { Poetry, PythonProject } from "projen/lib/python";
import {
  TypeScriptProject,
  TypeScriptProjectOptions,
} from "projen/lib/typescript";
import { NxProject } from "./nx-project";
import { Nx } from "./nx-types";
import { DEFAULT_CONFIG, SyncpackConfig } from "./syncpack-options";

/**
 * Execute download/execute command to run based on package manager configured.
 *
 * @param packageManager package manager being used.
 * @param args args to append.
 */
export function buildDownloadExecutableCommand(
  packageManager: NodePackageManager,
  ...args: string[]
) {
  if (args.length === 0) {
    throw new Error("args must be specified");
  }
  const argLiteral = args.join(" ");
  switch (packageManager) {
    case NodePackageManager.YARN2:
      return `yarn dlx ${argLiteral}`;
    case NodePackageManager.PNPM:
      return `pnpm dlx ${argLiteral}`;
    case NodePackageManager.YARN:
    default:
      return `npx ${argLiteral}`;
  }
}

/**
 * Execute command to run based on package manager configured.
 *
 * @param packageManager package manager being used.
 * @param args args to append.
 */
export function buildExecutableCommand(
  packageManager: NodePackageManager,
  ...args: string[]
) {
  if (args.length === 0) {
    throw new Error("args must be specified");
  }
  const argLiteral = args.join(" ");
  switch (packageManager) {
    case NodePackageManager.YARN:
    case NodePackageManager.YARN2:
      return `yarn run ${argLiteral}`;
    case NodePackageManager.PNPM:
      return `pnpm exec ${argLiteral}`;
    default:
      return `npx ${argLiteral}`;
  }
}

function binCommand(packageManager: NodePackageManager): string {
  switch (packageManager) {
    case NodePackageManager.YARN:
    case NodePackageManager.YARN2:
      return `yarn bin`;
    case NodePackageManager.PNPM:
      return `pnpm bin`;
    default:
      return `npm bin`;
  }
}

/**
 * Workspace configurations.
 *
 * @see https://classic.yarnpkg.com/lang/en/docs/workspaces/
 */
export interface WorkspaceConfig {
  /**
   * List of package globs to exclude from hoisting in the workspace.
   *
   * @see https://classic.yarnpkg.com/blog/2018/02/15/nohoist/
   */
  readonly noHoist?: string[];

  /**
   * Disable automatically applying `noHoist` logic for all sub-project "bundledDependencies".
   *
   * @default false
   */
  readonly disableNoHoistBundled?: boolean;

  /**
   * Links all local workspace project bins so they can be used for local development.
   *
   * Package bins are only linked when installed from the registry, however it is very useful
   * for monorepo development to also utilize these bin scripts. When enabled, this flag will
   * recursively link all bins from packages.json files to the root node_modules/.bin.
   */
  readonly linkLocalWorkspaceBins?: boolean;

  /**
   * List of additional package globs to include in the workspace.
   *
   * All packages which are parented by the monorepo are automatically added to the workspace, but you can use this
   * property to specify any additional paths to packages which may not be managed by projen.
   */
  readonly additionalPackages?: string[];
}

/**
 * Configuration for Monorepo Upgrade Deps task.
 */
export interface MonorepoUpgradeDepsOptions {
  /**
   * Name of the task to create.
   *
   * @default upgrade-deps
   */
  readonly taskName?: string;

  /**
   * Syncpack configuration.
   *
   * No merging is performed and as such a complete syncpackConfig is required if supplied.
   *
   * @default SyncpackConfig.DEFAULT_CONFIG
   */
  readonly syncpackConfig?: SyncpackConfig;
}

/**
 * Configuration options for the NxMonorepoProject.
 */
export interface NxMonorepoProjectOptions extends TypeScriptProjectOptions {
  /**
   * Configuration for NX.
   */
  readonly nxConfig?: Nx.WorkspaceConfig;

  /**
   * Configuration for workspace.
   */
  readonly workspaceConfig?: WorkspaceConfig;

  /**
   * Whether to include an upgrade-deps task at the root of the monorepo which will upgrade all dependencies.
   *
   * @default true
   */
  readonly monorepoUpgradeDeps?: boolean;

  /**
   * Monorepo Upgrade Deps options.
   *
   * This is only used if monorepoUpgradeDeps is true.
   *
   * @default undefined
   */
  readonly monorepoUpgradeDepsOptions?: MonorepoUpgradeDepsOptions;
}

/**
 *
 * @see https://nx.dev/packages/nx/documents/run-many#options
 */
export interface NxRunManyOptions {
  /** Task to run for affected projects */
  readonly target: string;
  /** This is the configuration to use when performing tasks on projects */
  readonly configuration?: string;
  /** Exclude certain projects from being processed */
  readonly exclude?: string;
  /**
   * Do not stop command execution after the first failed task.
   */
  readonly noBail?: boolean;
  /**
   * Defines how Nx emits outputs tasks logs
   * @default "stream"
   */
  readonly outputStyle?:
    | "dynamic"
    | "static"
    | "stream"
    | "stream-without-prefixes";
  /**
   * Max number of parallel processes
   * @default 3
   */
  readonly parallel?: number;
  /** Project to run as list project names and/or patterns. */
  readonly projects?: string[];
  /** This is the name of the tasks runner configuration in nx.json */
  readonly runner?: string;
  /** Rerun the tasks even when the results are available in the cache. */
  readonly skipCache?: boolean;
  /** Ignore cycles in the task graph */
  readonly ignoreCycles?: boolean;
  /** Prints additional information about the commands (e.g. stack traces). */
  readonly verbose?: boolean;
}

/**
 * Options for overriding nx build tasks
 * @internal
 */
interface OverrideNxBuildTaskOptions {
  /**
   * Force unlocking task (eg: build task is locked)
   */
  readonly force?: boolean;
  /**
   * Disable further resets of the task by other components in further lifecycle stages
   * (eg eslint resets during preSynthesize)
   */
  readonly disableReset?: boolean;
}

/**
 * This project type will bootstrap a NX based monorepo with support for polygot
 * builds, build caching, dependency graph visualization and much more.
 *
 * @pjid nx-monorepo
 */
export class NxMonorepoProject extends TypeScriptProject {
  // immutable data structures
  private readonly nxConfig?: Nx.WorkspaceConfig;
  private readonly workspaceConfig?: WorkspaceConfig;
  private readonly workspacePackages: string[];

  public readonly nxJson: JsonFile;

  private readonly _options: NxMonorepoProjectOptions;

  constructor(options: NxMonorepoProjectOptions) {
    super({
      ...options,
      github: options.github ?? false,
      package: options.package ?? false,
      projenCommand: options.packageManager
        ? buildExecutableCommand(options.packageManager, "projen")
        : undefined,
      prettier: options.prettier ?? true,
      projenrcTs: true,
      release: options.release ?? false,
      jest: options.jest ?? false,
      defaultReleaseBranch: options.defaultReleaseBranch ?? "mainline",
      sampleCode: false, // root should never have sample code,
      gitignore: [".nx/cache", ...(options.gitignore ?? [])],
      eslintOptions: options.eslintOptions ?? {
        dirs: ["."],
        ignorePatterns: ["packages/**/*.*"],
      },
      tsconfig: options.tsconfig ?? {
        compilerOptions: {
          rootDir: ".",
        },
        include: ["**/*.ts"],
      },
    });

    this._options = options;

    // engines
    this.package.addEngine("node", ">=16");
    switch (this.package.packageManager) {
      case NodePackageManager.PNPM: {
        // https://pnpm.io/package_json
        // https://github.com/pnpm/pnpm/releases/tag/v8.0.0
        this.package.addEngine("pnpm", ">=8");
        break;
      }
      case NodePackageManager.YARN: {
        this.package.addEngine("yarn", ">=1 <2");
        break;
      }
      case NodePackageManager.YARN2: {
        this.package.addEngine("yarn", ">=2 <3");
        break;
      }
    }

    this.nxConfig = options.nxConfig;
    this.workspaceConfig = options.workspaceConfig;
    this.workspacePackages = options.workspaceConfig?.additionalPackages ?? [];

    // Never publish a monorepo root package.
    this.package.addField("private", true);

    // Add alias task for "projen" to synthesize workspace
    this.addTask("synth-workspace", {
      exec: buildExecutableCommand(this.package.packageManager, "projen"),
      description: "Synthesize workspace",
    });

    this.addTask("run-many", {
      receiveArgs: true,
      exec: buildExecutableCommand(
        this.package.packageManager,
        "nx",
        "run-many"
      ),
      env: {
        NX_NON_NATIVE_HASHER: "true",
      },
      description: "Run task against multiple workspace projects",
    });

    this.addTask("graph", {
      receiveArgs: true,
      exec: buildExecutableCommand(this.package.packageManager, "nx", "graph"),
      description: "Generate dependency graph for monorepo",
    });

    // Map tasks to nx run-many
    if (options.scripts == null || options.scripts.build == null) {
      this._overrideNxBuildTask(
        this.buildTask,
        { target: "build" },
        { force: true }
      );
    }
    if (options.scripts == null || options.scripts["pre-compile"] == null) {
      this._overrideNxBuildTask(this.preCompileTask, { target: "pre-compile" });
    }
    if (options.scripts == null || options.scripts.compile == null) {
      this._overrideNxBuildTask(this.compileTask, { target: "compile" });
    }
    if (options.scripts == null || options.scripts["post-compile"] == null) {
      this._overrideNxBuildTask(this.postCompileTask, {
        target: "post-compile",
      });
    }
    if (options.scripts == null || options.scripts.test == null) {
      this._overrideNxBuildTask(this.testTask, { target: "test" });
    }
    if (options.scripts == null || options.scripts.eslint == null) {
      // The Projenrc component of TypeScriptProject resets the eslint task as part of preSynthesize which would undo
      // our changes, so we disable further resets.
      this._overrideNxBuildTask(
        this.eslint?.eslintTask,
        { target: "eslint" },
        { disableReset: true }
      );
    }
    if (options.scripts == null || options.scripts.package == null) {
      this._overrideNxBuildTask(this.packageTask, { target: "package" });
    }
    if (options.scripts == null || options.scripts.prepare == null) {
      this._overrideNxBuildTask("prepare", { target: "prepare" });
    }
    if (options.scripts == null || options.scripts.watch == null) {
      this._overrideNxBuildTask(this.watchTask, {
        target: "watch",
        noBail: false,
        ignoreCycles: true,
        skipCache: true,
        outputStyle: "stream",
      });
    }

    this.addDevDeps("nx", "@nrwl/cli", "@nrwl/workspace");
    this.addDeps("aws-cdk-lib", "constructs", "cdk-nag"); // Needed as this can be bundled in aws-prototyping-sdk
    this.package.addPackageResolutions("@types/babel__traverse@7.18.2");

    if (options.monorepoUpgradeDeps !== false) {
      this.addDevDeps("npm-check-updates", "syncpack");

      const upgradeDepsTask = this.addTask(
        options.monorepoUpgradeDepsOptions?.taskName || "upgrade-deps"
      );
      upgradeDepsTask.exec(
        buildExecutableCommand(
          this.package.packageManager,
          "npm-check-updates",
          "--deep",
          "--rejectVersion",
          "0.0.0",
          "-u"
        )
      );
      upgradeDepsTask.exec(
        buildExecutableCommand(
          this.package.packageManager,
          "syncpack",
          "fix-mismatches"
        )
      );
      upgradeDepsTask.exec(`${this.package.packageManager} install`);
      upgradeDepsTask.exec(
        buildExecutableCommand(this.package.packageManager, "projen")
      );

      new JsonFile(this, ".syncpackrc.json", {
        obj:
          options.monorepoUpgradeDepsOptions?.syncpackConfig || DEFAULT_CONFIG,
        readonly: true,
      });
    }

    options.nxConfig?.nxCloudReadOnlyAccessToken &&
      this.addDevDeps("@nrwl/nx-cloud");

    new IgnoreFile(this, ".nxignore").exclude(
      "test-reports",
      "target",
      ".env",
      ".pytest_cache",
      ...(this.nxConfig?.nxIgnore || [])
    );

    this.nxJson = new JsonFile(this, "nx.json", {
      obj: {
        extends: "@nrwl/workspace/presets/npm.json",
        npmScope: "monorepo",
        tasksRunnerOptions: {
          default: {
            runner: options.nxConfig?.nxCloudReadOnlyAccessToken
              ? "@nrwl/nx-cloud"
              : "@nrwl/workspace/tasks-runners/default",
            options: {
              useDaemonProcess: false,
              cacheableOperations: options.nxConfig?.cacheableOperations || [
                "build",
                "test",
              ],
              accessToken: options.nxConfig?.nxCloudReadOnlyAccessToken,
            },
          },
        },
        namedInputs: {
          // https://nx.dev/more-concepts/customizing-inputs#defaults
          default: ["{projectRoot}/**/*"],
          ...options.nxConfig?.namedInputs,
        },
        targetDefaults: options.nxConfig?.targetDefaults,
        targetDependencies: {
          build: [
            {
              target: "build",
              projects: "dependencies",
            },
          ],
          ...(this.nxConfig?.targetDependencies || {}),
        },
        affected: {
          defaultBase: this.nxConfig?.affectedBranch || "mainline",
        },
      },
    });
  }

  /**
   * Ensure NXProject is added when adding subprojects to the monorepo.
   *
   * @internal
   * @param subproject project to add.
   */
  _addSubProject(subproject: Project) {
    !NxProject.of(subproject) &&
      subproject._addComponent(new NxProject(subproject));
    super._addSubProject(subproject);
  }

  /**
   * Helper to format `npx nx run-many ...` style command.
   * @param options
   */
  public formatNxRunManyCommand(options: NxRunManyOptions): string {
    const args: string[] = [];
    if (options.configuration) {
      args.push(`--configuration=${options.configuration}`);
    }
    if (options.runner) {
      args.push(`--runner=${options.runner}`);
    }
    if (options.parallel) {
      args.push(`--parallel=${options.parallel}`);
    }
    if (options.skipCache) {
      args.push("--skip-nx-cache");
    }
    if (options.ignoreCycles) {
      args.push("--nx-ignore-cycles");
    }
    if (options.noBail !== true) {
      args.push("--nx-bail");
    }
    if (options.projects && options.projects.length) {
      args.push(`--projects=${options.projects.join(",")}`);
    }
    if (options.exclude) {
      args.push(`--exclude=${options.exclude}`);
    }
    if (options.verbose) {
      args.push("--verbose");
    }

    return buildExecutableCommand(
      this.package.packageManager,
      "nx",
      "run-many",
      `--target=${options.target}`,
      `--output-style=${options.outputStyle || "stream"}`,
      ...args
    );
  }

  /**
   * Overrides "build" related project tasks (build, compile, test, etc.) with `npx nx run-many` format.
   * @param task - The task or task name to override
   * @param options - Nx run-many options
   * @param overrideOptions - Options for overriding the task
   * @returns - The task that was overridden
   * @internal
   */
  protected _overrideNxBuildTask(
    task: Task | string | undefined,
    options: NxRunManyOptions,
    overrideOptions?: OverrideNxBuildTaskOptions
  ): Task | undefined {
    if (typeof task === "string") {
      task = this.tasks.tryFind(task);
    }

    if (task == null) {
      return;
    }

    if (overrideOptions?.force) {
      // @ts-ignore - private property
      task._locked = false;
    }

    task.reset(this.formatNxRunManyCommand(options), {
      receiveArgs: true,
    });

    task.description += " for all affected projects";

    // Fix for https://github.com/nrwl/nx/pull/15071
    task.env("NX_NON_NATIVE_HASHER", "true");

    if (overrideOptions?.disableReset) {
      // Prevent any further resets of the task to force it to remain as the overridden nx build task
      task.reset = () => {};
    }

    return task;
  }

  /**
   * Add project task that executes `npx nx run-many ...` style command.
   */
  public addNxRunManyTask(name: string, options: NxRunManyOptions): Task {
    return this.addTask(name, {
      receiveArgs: true,
      exec: this.formatNxRunManyCommand(options),
      env: {
        NX_NON_NATIVE_HASHER: "true",
      },
    });
  }

  /**
   * Create an implicit dependency between two Projects. This is typically
   * used in polygot repos where a Typescript project wants a build dependency
   * on a Python project as an example.
   *
   * @param dependent project you want to have the dependency.
   * @param dependee project you wish to depend on.
   * @throws error if this is called on a dependent which does not have a NXProject component attached.
   */
  public addImplicitDependency(dependent: Project, dependee: Project | string) {
    const nxProject = NxProject.of(dependent);

    if (!nxProject) {
      throw new Error(
        `${dependent.name} does not have an NXProject associated.`
      );
    } else {
      nxProject.addImplicitDependency(dependee);
    }
  }

  /**
   * Adds a dependency between two Java Projects in the monorepo.
   * @param dependent project you want to have the dependency
   * @param dependee project you wish to depend on
   */
  public addJavaDependency(dependent: JavaProject, dependee: JavaProject) {
    // Add implicit dependency for build order
    this.addImplicitDependency(dependent, dependee);

    // Add dependency in pom.xml
    dependent.addDependency(
      `${dependee.pom.groupId}/${dependee.pom.artifactId}@${dependee.pom.version}`
    );

    // Add a repository so that the dependency in the pom can be resolved
    dependent.pom.addRepository({
      id: dependee.name,
      url: `file://${path.join(
        path.relative(dependent.outdir, dependee.outdir),
        "dist",
        "java"
      )}`,
    });
  }

  /**
   * Adds a dependency between two Python Projects in the monorepo. The dependent must have Poetry enabled.
   * @param dependent project you want to have the dependency (must be a Poetry Python Project)
   * @param dependee project you wish to depend on
   * @throws error if the dependent does not have Poetry enabled
   */
  public addPythonPoetryDependency(
    dependent: PythonProject,
    dependee: PythonProject
  ) {
    // Check we're adding the dependency to a poetry python project
    if (!(dependent.depsManager instanceof Poetry)) {
      throw new Error(
        `${dependent.name} must be a PythonProject with Poetry enabled to add this dependency`
      );
    }

    // Add implicit dependency for build order
    this.addImplicitDependency(dependent, dependee);

    // Add local path dependency
    dependent.addDependency(
      `${dependee.name}@{path="${path.relative(
        dependent.outdir,
        dependee.outdir
      )}", develop=true}`
    );
  }

  /**
   * Add one or more additional package globs to the workspace.
   * @param packageGlobs paths to the package to include in the workspace (for example packages/my-package)
   */
  public addWorkspacePackages(...packageGlobs: string[]) {
    // Any subprojects that were added since the last call to this method need to be added first, in order to ensure
    // we add the workspace packages in a sane order.
    const relativeSubProjectWorkspacePackages =
      this.instantiationOrderSubProjects.map((project) =>
        path.relative(this.outdir, project.outdir)
      );
    const existingWorkspacePackages = new Set(this.workspacePackages);
    this.workspacePackages.push(
      ...relativeSubProjectWorkspacePackages.filter(
        (pkg) => !existingWorkspacePackages.has(pkg)
      )
    );

    // Add the additional packages next
    this.workspacePackages.push(...packageGlobs);
  }

  // Remove this hack once subProjects is made public in Projen
  private get instantiationOrderSubProjects(): Project[] {
    // @ts-ignore
    const subProjects: Project[] = this.subprojects || [];
    return subProjects;
  }

  public get subProjects(): Project[] {
    return [...this.instantiationOrderSubProjects].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }

  /**
   * Create symbolic links to all local workspace bins. This enables the usage of bins the same
   * way as consumers of the packages have when installing from the registry.
   */
  protected linkLocalWorkspaceBins(): void {
    const bins: [string, string][] = [];

    this.subProjects.forEach((subProject) => {
      if (subProject instanceof NodeProject) {
        const pkgBins: Record<string, string> =
          subProject.package.manifest.bin() || {};
        bins.push(
          ...Object.entries(pkgBins).map(([cmd, bin]) => {
            const resolvedBin = path.join(
              "$PWD",
              path.relative(this.outdir, subProject.outdir),
              bin
            );
            return [cmd, resolvedBin] as [string, string];
          })
        );
      }
    });

    const linkTask = this.addTask("workspace:bin:link", {
      steps: bins.map(([cmd, bin]) => ({
        exec: `ln -s ${bin} $(${binCommand(
          this.package.packageManager
        )})/${cmd} &>/dev/null; exit 0;`,
      })),
    });

    (this.tasks.tryFind("prepare") || this.addTask("prepare")).spawn(linkTask);
  }

  preSynthesize(): void {
    super.preSynthesize();

    if (this._options.workspaceConfig?.linkLocalWorkspaceBins === true) {
      this.linkLocalWorkspaceBins();
    }

    if (this.package.packageManager === NodePackageManager.PNPM) {
      // PNPM hoisting hides transitive bundled dependencies which results in
      // transitive dependencies being packed incorrectly.
      this.subProjects.forEach((subProject) => {
        if (isNodeProject(subProject) && getBundledDeps(subProject).length) {
          const pkgFolder = path.relative(this.root.outdir, subProject.outdir);
          // Create a symlink in the sub-project node_modules for all transitive deps
          // before running "package" task
          subProject.packageTask.prependExec(
            `pdk@pnpm-link-bundled-transitive-deps ${pkgFolder}`
          );
        }
      });
    }
  }

  /**
   * @inheritDoc
   */
  synth() {
    this.validateSubProjects();
    this.updateWorkspace();
    this.installNonNodeDependencies();

    // Prevent sub NodeProject packages from `postSynthesis` which will cause individual/extraneous installs.
    // The workspace package install will handle all the sub NodeProject packages automatically.
    const subProjectPackages: NodePackage[] = [];
    this.subProjects.forEach((subProject) => {
      if (isNodeProject(subProject)) {
        const subNodeProject: NodeProject = subProject as NodeProject;
        subProjectPackages.push(subNodeProject.package);
        // @ts-ignore - `installDependencies` is private
        subNodeProject.package.installDependencies = () => {};
      }
    });

    super.synth();

    // Force workspace install deps if any node subproject package has changed, unless the workspace changed
    if (
      // @ts-ignore - `file` is private
      (this.package.file as JsonFile).changed !== true &&
      // @ts-ignore - `file` is private
      subProjectPackages.find((pkg) => (pkg.file as JsonFile).changed === true)
    ) {
      // @ts-ignore - `installDependencies` is private
      this.package.installDependencies();
    }
  }

  /**
   * Ensures subprojects don't have a default task and that all packages use the same package manager.
   */
  private validateSubProjects() {
    this.subProjects.forEach((subProject: any) => {
      // Disable default task on subprojects as this isn't supported in a monorepo
      subProject.defaultTask?.reset();

      if (
        isNodeProject(subProject) &&
        subProject.package.packageManager !== this.package.packageManager
      ) {
        throw new Error(
          `${subProject.name} packageManager does not match the monorepo packageManager: ${this.package.packageManager}.`
        );
      }
    });
  }

  /**
   * Add a submodule entry to the appropriate workspace file.
   */
  private updateWorkspace() {
    // A final call to addWorkspacePackages will update the list of workspace packages with any subprojects that have
    // not yet been added, in the correct order
    this.addWorkspacePackages();

    let noHoist = this.workspaceConfig?.noHoist;
    // Automatically add all sub-project "bundledDependencies" to workspace "hohoist", otherwise they are not bundled in npm package
    if (this.workspaceConfig?.disableNoHoistBundled !== true) {
      const noHoistBundled = this.subProjects.flatMap((sub) => {
        if (sub instanceof NodeProject) {
          return getBundledDeps(sub).flatMap((dep) => [
            `${sub.name}/${dep.name}`,
            `${sub.name}/${dep.name}/*`,
          ]);
        }
        return [];
      });

      if (noHoistBundled.length) {
        noHoist = [...(noHoist || []), ...noHoistBundled];
      }
    }

    // Add workspaces for each subproject
    if (this.package.packageManager === NodePackageManager.PNPM) {
      new YamlFile(this, "pnpm-workspace.yaml", {
        readonly: true,
        obj: {
          packages: this.workspacePackages,
        },
      });
    }
    this.package.addField("workspaces", {
      packages: this.workspacePackages,
      nohoist: noHoist,
    });
  }

  /**
   * Ensures the install task for non-node projects is executed postinstall.
   *
   * @private
   */
  private installNonNodeDependencies() {
    const installProjects = this.subProjects.filter(
      (project) =>
        !(project instanceof NodeProject) && project.tasks.tryFind("install")
    );

    if (installProjects.length > 0) {
      const monorepoInstallTask =
        this.tasks.tryFind("postinstall") ?? this.addTask("postinstall");
      monorepoInstallTask.exec(
        buildExecutableCommand(
          this.package.packageManager,
          `nx run-many --target install --projects ${installProjects
            .map((project) => project.name)
            .join(",")} --parallel=1`
        )
      );

      // Update the nx.json to ensure that install-py follows dependency order
      this.nxJson.addOverride("targetDependencies.install", [
        {
          target: "install",
          projects: "dependencies",
        },
      ]);
    }
  }
}

/**
 * Determines if the passed in project is of type NodeProject.
 *
 * @param project Project instance.
 * @returns true if the project instance is of type NodeProject.
 */
function isNodeProject(project: any): project is NodeProject {
  return project instanceof NodeProject || project.package;
}

/**
 * Gets bundled dependencies for a given project
 */
function getBundledDeps(project: Project): Dependency[] {
  return project.deps.all.filter((dep) => dep.type === DependencyType.BUNDLED);
}
