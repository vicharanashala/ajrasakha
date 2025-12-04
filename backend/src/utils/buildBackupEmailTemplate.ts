export const buildBackupEmailTemplate = (
  timestamp: string,
  publicUrl: string,
) => {
  return `
  <h2>🎉 MongoDB Backup Successful</h2>
  <p>Your database backup for <strong>${timestamp}</strong> is ready.</p>
  <p>🔗 <a href="${publicUrl}">${publicUrl}</a></p>
  <br/>
  <p>Thanks,<br/>Backup System</p>
`;
};
