export function getUnreadNotificationIds(
  notifications: Array<{ id: string }>,
  readIds: string[]
) {
  return notifications
    .filter((notification) => !readIds.includes(notification.id))
    .map((notification) => notification.id);
}
