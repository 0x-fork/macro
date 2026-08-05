import { hasWorkDomain } from '../scenario';

const WORK_CONTACTS = [
  'nikhil@macro.com',
  'priya@macro.com',
  'tom@macro.com',
  'sarah@macro.com',
  'diego@macro.com',
  'ade@macro.com',
  'ellen@macro.com',
];

// Personal-email users still have contacts — just none on a team domain.
const PERSONAL_CONTACTS = ['mom@aol.com', 'nikhil@macro.com'];

export const useContacts = () => () =>
  (hasWorkDomain() ? WORK_CONTACTS : PERSONAL_CONTACTS).map((email) => ({
    id: email,
    email,
    name: email.split('@')[0],
  }));
