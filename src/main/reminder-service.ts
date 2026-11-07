import { Notification } from "electron";
import type { ReminderCheckResult } from "../shared/contracts";
import { AppLogger } from "./app-logger";
import { JobDatabase } from "./database";

export class ReminderService {
  constructor(
    private readonly database: JobDatabase,
    private readonly logger: AppLogger,
    private readonly showWindow: () => void,
  ) {}

  check(): ReminderCheckResult {
    const now = new Date();
    const due = this.database.listDueFollowUpReminders(now.toISOString());
    const enabled =
      this.database.getAppSetting("notifications.enabled") !== "false";
    if (!enabled) {
      return { due: due.length, delivered: 0, suppressed: false };
    }
    const dayKey = now.toISOString().slice(0, 10);
    const unseen = due.filter(
      (item) =>
        !this.database.hasNotificationDelivery(
          `follow-up:${item.id}:${dayKey}`,
        ),
    );
    if (!unseen.length) {
      return { due: due.length, delivered: 0, suppressed: false };
    }
    const supported = Notification.isSupported();
    const suppressed =
      !supported ||
      process.env.JOB_WORKBENCH_DISABLE_NOTIFICATIONS === "1";
    if (!suppressed) {
      const preview = unseen
        .slice(0, 3)
        .map((item) => `${item.company} · ${item.title}`)
        .join("\n");
      const notification = new Notification({
        title:
          unseen.length === 1
            ? "求职跟进已到期"
            : `${unseen.length} 项求职跟进已到期`,
        body:
          unseen.length === 1
            ? `${unseen[0].company} · ${unseen[0].title}`
            : preview,
      });
      notification.on("click", this.showWindow);
      notification.show();
    }
    for (const item of unseen) {
      this.database.markNotificationDelivery(
        `follow-up:${item.id}:${dayKey}`,
        "follow-up",
        item.id,
      );
    }
    this.logger.log(
      "info",
      suppressed
        ? `reminder.suppressed count=${unseen.length}`
        : `reminder.delivered count=${unseen.length}`,
    );
    return {
      due: due.length,
      delivered: unseen.length,
      suppressed,
    };
  }
}
