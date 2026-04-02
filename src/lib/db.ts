import { db, auth } from './firebase';
import { collection, doc, setDoc, getDocs, deleteDoc, query, where, orderBy, onSnapshot, getDoc } from 'firebase/firestore';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test connection
export async function testConnection() {
  try {
    await getDoc(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
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
  if (!auth.currentUser) throw new Error("User not authenticated");
  
  const id = crypto.randomUUID();
  const newQuestion = {
    id,
    userId: auth.currentUser.uid,
    ...question,
    createdAt: Date.now(),
  };

  try {
    await setDoc(doc(db, 'questions', id), newQuestion);
    return newQuestion;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `questions/${id}`);
  }
}

export async function getAllQuestions(studentId?: string) {
  if (!auth.currentUser) return [];
  
  try {
    let q;
    if (studentId) {
      q = query(
        collection(db, 'questions'), 
        where('userId', '==', auth.currentUser.uid),
        where('studentId', '==', studentId)
      );
    } else {
      q = query(
        collection(db, 'questions'),
        where('userId', '==', auth.currentUser.uid)
      );
    }
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as any).sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'questions');
    return [];
  }
}

export function subscribeToQuestions(studentId: string | undefined, callback: (questions: any[]) => void) {
  if (!auth.currentUser) {
    callback([]);
    return () => {};
  }
  
  let q;
  if (studentId) {
    q = query(
      collection(db, 'questions'), 
      where('userId', '==', auth.currentUser.uid),
      where('studentId', '==', studentId)
    );
  } else {
    q = query(
      collection(db, 'questions'),
      where('userId', '==', auth.currentUser.uid)
    );
  }
  
  return onSnapshot(q, (snapshot) => {
    const questions = snapshot.docs.map(doc => doc.data() as any).sort((a, b) => b.createdAt - a.createdAt);
    callback(questions);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'questions');
  });
}

export async function deleteQuestion(id: string) {
  if (!auth.currentUser) throw new Error("User not authenticated");
  
  try {
    await deleteDoc(doc(db, 'questions', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `questions/${id}`);
  }
}

// Student Management
export async function saveStudent(student: { name: string; grade?: string }) {
  if (!auth.currentUser) throw new Error("User not authenticated");
  
  const id = crypto.randomUUID();
  const newStudent = {
    id,
    userId: auth.currentUser.uid,
    ...student,
    createdAt: Date.now(),
  };

  try {
    await setDoc(doc(db, 'students', id), newStudent);
    return newStudent;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `students/${id}`);
  }
}

export async function getAllStudents() {
  if (!auth.currentUser) return [];
  
  try {
    const q = query(
      collection(db, 'students'),
      where('userId', '==', auth.currentUser.uid)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as any).sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'students');
    return [];
  }
}

export function subscribeToStudents(callback: (students: any[]) => void) {
  if (!auth.currentUser) {
    callback([]);
    return () => {};
  }
  
  const q = query(
    collection(db, 'students'),
    where('userId', '==', auth.currentUser.uid)
  );
  
  return onSnapshot(q, (snapshot) => {
    const students = snapshot.docs.map(doc => doc.data() as any).sort((a, b) => a.name.localeCompare(b.name));
    callback(students);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'students');
  });
}

export async function deleteStudent(id: string) {
  if (!auth.currentUser) throw new Error("User not authenticated");
  
  try {
    // Also delete all questions for this student
    const q = query(
      collection(db, 'questions'),
      where('userId', '==', auth.currentUser.uid),
      where('studentId', '==', id)
    );
    const querySnapshot = await getDocs(q);
    
    for (const docSnapshot of querySnapshot.docs) {
      await deleteDoc(doc(db, 'questions', docSnapshot.id));
    }
    
    await deleteDoc(doc(db, 'students', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `students/${id}`);
  }
}
