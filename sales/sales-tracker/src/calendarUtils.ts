export function generateGoogleCalendarUrl(params: {
  businessName: string;
  phone: string;
  notes: string;
  startTime: Date;
}): string {
  const formatTime = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, "");
  const endTime = new Date(params.startTime.getTime() + 30 * 60 * 1000);

  const title = encodeURIComponent(`Call: ${params.businessName}`);
  const details = encodeURIComponent(
    `Contact: ${params.businessName}\nPhone: ${params.phone}\nNotes: ${params.notes || "Follow-up call"}`
  );
  const dates = `${formatTime(params.startTime)}/${formatTime(endTime)}`;

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&dates=${dates}`;
}