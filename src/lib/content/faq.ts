export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'What is a DQF, and what does this tracker do?',
    answer:
      'A driver qualification file (DQF) is the record a motor carrier keeps for each driver under 49 CFR Part 391. This free tracker lets you enter the document dates you already have and shows an estimated next due date for each one, so nothing quietly expires.',
  },
  {
    question: 'Which expiration dates does the tracker calculate?',
    answer:
      "The tracker estimates a next date for the medical examiner's certificate, MVR pulls, and the annual review of driving record, and it shows the CDL expiration date you enter. Road tests and employment verification are shown as one-time documents. Drug and alcohol random testing is listed for reference only because it is a program-level requirement, not a single date.",
  },
  {
    question: 'Where is my driver data stored?',
    answer:
      'Driver labels and dates are stored only in your browser using localStorage. They are not uploaded to a server, and analytics never include names, dates, or backup files. Optional analytics are off until you choose: if you allow them, the page records anonymous events with bucketed counts, page path, device type, and referrer host; if you reject, only event names and counts are sent. You can export a JSON backup at any time, and clearing your browser data removes the tracker data.',
  },
  {
    question: 'Are the dates legal advice or a guarantee of compliance?',
    answer:
      'No. The dates are estimates based on the information you enter and 49 CFR Part 391. This is not legal advice and does not guarantee compliance or audit results. Rules can change, so verify with FMCSA or your safety consultant.',
  },
  {
    question: 'Can I track more than five drivers, and can I export my data?',
    answer:
      'The free tracker supports up to five drivers. You can export all entered drivers to a JSON backup file and import it later on the same browser or another device. Import replaces the current data after you confirm.',
  },
];
