// AI agent that reads an uploaded CNIC/ID photo and checks whether it has
// expired, so customers find out immediately (instead of after PTCL
// rejects the application days later). Uses Claude's vision ability to
// read the "Date of Expiry" printed on a Pakistani CNIC.
//
// Built defensively: if ANTHROPIC_API_KEY isn't set, this returns a
// success:true/unchecked result rather than blocking every application —
// staff can still verify manually from the uploaded document.

const Anthropic = require('@anthropic-ai/sdk');

let anthropic = null;
try {
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
} catch (err) {
  console.error('PTCLConnect: Anthropic client not initialized:', err && err.message ? err.message : err);
}

const MODEL = 'claude-sonnet-5';

const CNIC_TOOL = {
  name: 'reportCnicDetails',
  description:
    "Report what was found on the uploaded identity document: whether it looks like a genuine " +
    "Pakistani CNIC (or a passport), the expiry date printed on it (if any), and whether that " +
    'date has already passed today.',
  input_schema: {
    type: 'object',
    properties: {
      documentType: {
        type: 'string',
        enum: ['cnic', 'passport', 'other', 'unreadable'],
        description: 'What kind of document this appears to be.',
      },
      expiryDateFound: {
        type: 'boolean',
        description: 'Whether an expiry date is visible on the document.',
      },
      expiryDate: {
        type: 'string',
        description: 'The expiry date exactly as printed (e.g. "12.05.2027"), if found. Omit if not found.',
      },
      isExpired: {
        type: 'boolean',
        description: 'True only if expiryDateFound is true AND that date is before today.',
      },
    },
    required: ['documentType', 'expiryDateFound', 'isExpired'],
  },
};

// file: multer file object ({ buffer, mimetype }).
async function checkCnicExpiry(file) {
  if (!anthropic) {
    return {
      success: true,
      checked: false,
      expired: false,
      message: 'Document uploaded — expiry could not be auto-checked, our team will verify it manually.',
    };
  }

  try {
    const base64Data = file.buffer.toString('base64');
    const today = new Date().toISOString().slice(0, 10);

    const contentBlock =
      file.mimetype === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } }
        : { type: 'image', source: { type: 'base64', media_type: file.mimetype, data: base64Data } };

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      tools: [CNIC_TOOL],
      tool_choice: { type: 'tool', name: 'reportCnicDetails' },
      messages: [
        {
          role: 'user',
          content: [
            contentBlock,
            {
              type: 'text',
              text:
                `Today's date is ${today}. Look at this identity document image. Find the ` +
                '"Date of Expiry" printed on it (Pakistani CNICs print this on the front). Report ' +
                'the document type, the exact expiry date text if visible, and whether it is ' +
                'already expired compared to today. If you cannot read the document clearly, set ' +
                'documentType to "unreadable".',
            },
          ],
        },
      ],
    });

    const toolUse = response.content.find((b) => b.type === 'tool_use');
    if (!toolUse) {
      return { success: true, checked: false, expired: false, message: 'Could not analyze document automatically.' };
    }

    const result = toolUse.input;

    if (result.documentType === 'unreadable') {
      return {
        success: false,
        checked: false,
        message: 'This image is unclear — please upload a clearer photo of your CNIC or passport.',
      };
    }

    if (result.documentType === 'passport') {
      // Passports don't carry the same "CNIC expiry" rule for this check —
      // accept and let staff verify manually.
      return { success: true, checked: true, expired: false, message: 'Passport received.' };
    }

    if (!result.expiryDateFound) {
      return { success: true, checked: false, expired: false, message: 'Document received — expiry date not clearly visible, our team will verify.' };
    }

    return {
      success: true,
      checked: true,
      expired: Boolean(result.isExpired),
      expiryDate: result.expiryDate || null,
    };
  } catch (err) {
    console.error('CNIC check error:', err && err.message ? err.message : err);
    return { success: true, checked: false, expired: false, message: 'Document uploaded — could not auto-check right now.' };
  }
}

module.exports = { checkCnicExpiry };
