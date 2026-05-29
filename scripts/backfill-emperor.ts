import * as admin from 'firebase-admin';

admin.initializeApp();

async function backfillEmperor() {
  const email = 'ryan@omniatheatre.com';
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { emperor: true });
    console.log(`✅ Emperor claim set for UID: ${user.uid} (${email})`);
  } catch (err) {
    console.error('❌ Backfill failed:', err);
    process.exit(1);
  }
}

backfillEmperor();
