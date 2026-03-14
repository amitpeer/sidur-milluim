export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12" dir="rtl">
      <h1 className="mb-6 text-2xl font-bold">מדיניות פרטיות</h1>
      <div className="space-y-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
        <p>
          סידור מילואים היא אפליקציה לניהול סידור שירות מילואים.
        </p>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          מידע שנאסף
        </h2>
        <p>
          האפליקציה אוספת את שם המשתמש, כתובת האימייל ותמונת הפרופיל מחשבון
          Google שלך לצורך זיהוי והתחברות בלבד.
        </p>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          שימוש במידע
        </h2>
        <p>
          המידע משמש אך ורק לצורך הפעלת האפליקציה ואינו משותף עם צדדים שלישיים.
        </p>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          מחיקת מידע
        </h2>
        <p>
          ניתן לבקש מחיקת כל המידע על ידי פנייה למנהל המערכת.
        </p>
      </div>
    </main>
  );
}
