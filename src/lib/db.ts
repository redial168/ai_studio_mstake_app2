import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface QuestionDB extends DBSchema {
  questions: {
    key: string;
    value: {
      id: string;
      studentId: string;
      originalUrl: string;
      processedUrl: string;
      createdAt: number;
      subject?: string;
      grade?: string;
      volume?: string;
      unit?: string;
      date?: string;
      time?: string;
      remarks?: string;
      note?: string; // Keep for backward compatibility if needed
    };
    indexes: { 
      'by-date': number;
      'by-student': string;
    };
  };
  students: {
    key: string;
    value: {
      id: string;
      name: string;
      grade?: string;
      createdAt: number;
    };
    indexes: { 'by-name': string };
  };
}

let dbPromise: Promise<IDBPDatabase<QuestionDB>>;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<QuestionDB>('question-bank', 3, {
      upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          const store = db.createObjectStore('questions', {
            keyPath: 'id',
          });
          store.createIndex('by-date', 'createdAt');
          store.createIndex('by-student', 'studentId');
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('students')) {
            const studentStore = db.createObjectStore('students', {
              keyPath: 'id',
            });
            studentStore.createIndex('by-name', 'name');
          }
          // Ensure questions store has the student index if it didn't before
          const questionStore = tx.objectStore('questions');
          if (!questionStore.indexNames.contains('by-student')) {
            questionStore.createIndex('by-student', 'studentId');
          }
        }
        if (oldVersion < 3) {
          // Placeholder for version 3 migrations if any
          // For now, just bumping the version to resolve the error
        }
      },
    });
  }
  return dbPromise;
}

export async function saveQuestion(question: {
  studentId: string;
  originalUrl: string;
  processedUrl: string;
  subject?: string;
  grade?: string;
  volume?: string;
  unit?: string;
  date?: string;
  time?: string;
  remarks?: string;
  note?: string;
}) {
  const db = await getDB();
  const id = crypto.randomUUID();
  const newQuestion = {
    id,
    ...question,
    createdAt: Date.now(),
  };
  await db.add('questions', newQuestion);
  return newQuestion;
}

export async function getAllQuestions(studentId?: string) {
  const db = await getDB();
  if (studentId) {
    return db.getAllFromIndex('questions', 'by-student', studentId);
  }
  return db.getAllFromIndex('questions', 'by-date');
}

export async function deleteQuestion(id: string) {
  const db = await getDB();
  await db.delete('questions', id);
}

// Student Management
export async function saveStudent(student: { name: string; grade?: string }) {
  const db = await getDB();
  const id = crypto.randomUUID();
  const newStudent = {
    id,
    ...student,
    createdAt: Date.now(),
  };
  await db.add('students', newStudent);
  return newStudent;
}

export async function getAllStudents() {
  const db = await getDB();
  return db.getAllFromIndex('students', 'by-name');
}

export async function deleteStudent(id: string) {
  const db = await getDB();
  // Optional: Also delete all questions for this student
  const tx = db.transaction(['questions', 'students'], 'readwrite');
  const questionStore = tx.objectStore('questions');
  const studentStore = tx.objectStore('students');
  
  const questions = await questionStore.index('by-student').getAllKeys(id);
  for (const qId of questions) {
    await questionStore.delete(qId);
  }
  await studentStore.delete(id);
  await tx.done;
}
