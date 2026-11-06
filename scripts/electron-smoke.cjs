const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

async function main() {
  const userData = fs.mkdtempSync(
    path.join(os.tmpdir(), "job-workbench-e2e-"),
  );
  const packagedExecutable = process.env.JOB_WORKBENCH_PACKAGED_EXE;
  const app = await electron.launch({
    executablePath:
      packagedExecutable ||
      path.join(
        __dirname,
        "..",
        "node_modules",
        "electron",
        "dist",
        "electron.exe",
      ),
    args: packagedExecutable ? [] : ["."],
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      JOB_WORKBENCH_USER_DATA: userData,
    },
  });
  app.process().stderr?.on("data", (chunk) => {
    console.error(`[electron] ${chunk.toString()}`);
  });

  try {
    const page = await app.firstWindow();
    page.on("pageerror", (error) => console.error(`[pageerror] ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") {
        console.error(`[renderer] ${message.text()}`);
      }
    });
    await page.waitForSelector("text=职位池");
    await page.getByRole("button", { name: "手动添加岗位" }).click();
    const addDialog = page.locator(".modal");
    await addDialog.getByLabel("岗位名称", { exact: true }).fill("软件实施工程师");
    await addDialog.getByLabel("公司名称", { exact: true }).fill("测试科技");
    await addDialog.getByLabel("薪资", { exact: true }).fill("7-10K");
    await addDialog.getByLabel("城市", { exact: true }).fill("杭州");
    await addDialog
      .getByLabel("岗位描述", { exact: true })
      .fill("负责系统实施、客户培训和项目交付。");
    await addDialog.getByRole("button", { name: "添加", exact: true }).click();
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(__dirname, "..", "artifacts", "smoke-after-add.png"),
      fullPage: true,
    });
    await page.waitForSelector("text=软件实施工程师", { timeout: 8_000 });
    await page.locator(".job-main").first().click();
    await page.locator(".detail-panel").getByRole("button", { name: "编辑岗位" }).click();
    await page.locator(".detail-panel").getByLabel("薪资").fill("8-11K");
    await page.locator(".detail-panel").getByLabel("城市").fill("杭州");
    await page.locator(".detail-panel").getByLabel("区域").fill("余杭区");
    await page.locator(".detail-panel").getByLabel("个人备注").fill("端到端测试备注");
    await page.locator(".detail-panel").getByRole("button", { name: "保存" }).click();
    await page.locator(".job-controls .favorite").click();
    await page.locator(".job-controls select").selectOption("准备沟通");
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(__dirname, "..", "artifacts", "smoke-detail.png"),
      fullPage: false,
    });
    await page.locator(".job-select").check();
    await page.getByRole("button", { name: "归档选中" }).click();
    await page.waitForSelector("text=还没有岗位");
    await page.getByLabel("范围").selectOption("archived");
    await page.waitForSelector("text=软件实施工程师");
    await page.locator(".job-select").check();
    await page.getByRole("button", { name: "恢复选中" }).click();
    await page.getByLabel("范围").selectOption("active");
    await page.waitForSelector("text=软件实施工程师");
    await page.locator(".job-select").check();
    await page.getByRole("button", { name: "归档选中" }).click();
    await page.getByLabel("范围").selectOption("archived");
    await page.waitForSelector("text=软件实施工程师");
    await page.locator(".job-select").check();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "永久删除" }).click();
    await page.waitForSelector("text=还没有岗位");

    const dashboard = await page.evaluate(async () => {
      return window.jobWorkbench.getDashboard();
    });
    console.log(
      JSON.stringify({
        title: await page.title(),
        dashboard,
        userData,
      }),
    );
  } finally {
    await app.close();
    fs.rmSync(userData, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
