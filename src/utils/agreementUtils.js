/**
 * ============================================================
 * VERIFIED LOAN AGREEMENT SYSTEM - UTILITIES
 * ============================================================
 * Fraud detection, risk scoring, PDF generation, storage management
 */

import { supabase } from '../supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ============================================================
// AI FRAUD DETECTION & RISK SCORING
// ============================================================

/**
 * Run comprehensive fraud detection on a guarantor
 * Returns a risk assessment with scores and flags
 */
export async function runFraudDetection(guarantorData, agreementData) {
  const flags = [];
  const scores = {
    guarantor_check_score: 100,
    duplicate_check_score: 100,
    email_pattern_score: 100,
    phone_pattern_score: 100,
    identity_score: 100,
  };

  // 1. Check for duplicate guarantors across agreements
  try {
    const { data: existingGuarantors } = await supabase
      .from('agreement_parties')
      .select('id, agreement_id, email, phone, full_name, aadhaar')
      .eq('role', 'guarantor');

    if (existingGuarantors && existingGuarantors.length > 0) {
      // Check email duplicates
      const emailDuplicates = existingGuarantors.filter(
        g => g.email?.toLowerCase() === guarantorData.email?.toLowerCase()
      );
      if (emailDuplicates.length >= 3) {
        scores.duplicate_check_score -= 40;
        flags.push({
          type: 'DUPLICATE_GUARANTOR_EMAIL',
          severity: 'HIGH',
          message: `This email has been used as guarantor ${emailDuplicates.length} times before`,
        });
      } else if (emailDuplicates.length >= 1) {
        scores.duplicate_check_score -= 15;
        flags.push({
          type: 'REPEAT_GUARANTOR_EMAIL',
          severity: 'MEDIUM',
          message: `This email has been used as guarantor ${emailDuplicates.length} time(s) before`,
        });
      }

      // Check phone duplicates
      if (guarantorData.phone) {
        const phoneDuplicates = existingGuarantors.filter(
          g => g.phone === guarantorData.phone
        );
        if (phoneDuplicates.length >= 2) {
          scores.duplicate_check_score -= 20;
          flags.push({
            type: 'DUPLICATE_GUARANTOR_PHONE',
            severity: 'MEDIUM',
            message: `This phone number has been used as guarantor ${phoneDuplicates.length} times`,
          });
        }
      }

      // Check Aadhaar duplicates
      if (guarantorData.aadhaar) {
        const aadhaarDuplicates = existingGuarantors.filter(
          g => g.aadhaar === guarantorData.aadhaar
        );
        if (aadhaarDuplicates.length >= 1) {
          scores.identity_score -= 30;
          flags.push({
            type: 'DUPLICATE_AADHAAR',
            severity: 'HIGH',
            message: 'This Aadhaar number is already associated with another guarantor entry',
          });
        }
      }
    }
  } catch (err) {
    console.error('Fraud detection - duplicate check error:', err);
  }

  // 2. Email pattern validation
  if (guarantorData.email) {
    const email = guarantorData.email.toLowerCase();
    
    // Disposable email domains
    const disposableDomains = [
      'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com',
      'yopmail.com', 'trashmail.com', '10minutemail.com', 'fakeinbox.com',
      'sharklasers.com', 'guerrillamailblock.com', 'temp-mail.org'
    ];
    
    const emailDomain = email.split('@')[1];
    if (disposableDomains.includes(emailDomain)) {
      scores.email_pattern_score -= 50;
      flags.push({
        type: 'DISPOSABLE_EMAIL',
        severity: 'HIGH',
        message: 'Guarantor is using a disposable email address',
      });
    }

    // Check for suspicious patterns
    const suspiciousPatterns = /^(test|fake|dummy|temp|no.?reply|admin|xxx)/i;
    if (suspiciousPatterns.test(email.split('@')[0])) {
      scores.email_pattern_score -= 25;
      flags.push({
        type: 'SUSPICIOUS_EMAIL_PATTERN',
        severity: 'MEDIUM',
        message: 'Email address contains suspicious patterns',
      });
    }

    // Check borrower email == guarantor email
    if (email === agreementData.borrowerEmail?.toLowerCase()) {
      scores.email_pattern_score -= 50;
      flags.push({
        type: 'GUARANTOR_IS_BORROWER',
        severity: 'HIGH',
        message: 'Guarantor email matches borrower email',
      });
    }
  }

  // 3. Phone pattern validation
  if (guarantorData.phone) {
    const phone = guarantorData.phone.replace(/\D/g, '');
    
    // Indian phone number validation
    if (phone.length < 10) {
      scores.phone_pattern_score -= 30;
      flags.push({
        type: 'INVALID_PHONE_LENGTH',
        severity: 'MEDIUM',
        message: 'Phone number appears to be too short',
      });
    }
    
    // Check for all-same digits
    if (/^(\d)\1+$/.test(phone)) {
      scores.phone_pattern_score -= 40;
      flags.push({
        type: 'FAKE_PHONE_PATTERN',
        severity: 'HIGH',
        message: 'Phone number has all identical digits',
      });
    }

    // Sequential number check
    if (/^(0123456789|1234567890|9876543210)/.test(phone)) {
      scores.phone_pattern_score -= 25;
      flags.push({
        type: 'SEQUENTIAL_PHONE',
        severity: 'MEDIUM',
        message: 'Phone number appears to be sequential',
      });
    }
  } else {
    scores.phone_pattern_score -= 15;
    flags.push({
      type: 'MISSING_PHONE',
      severity: 'LOW',
      message: 'No phone number provided for guarantor',
    });
  }

  // 4. Identity verification
  if (!guarantorData.aadhaar) {
    scores.identity_score -= 20;
    flags.push({
      type: 'MISSING_AADHAAR',
      severity: 'MEDIUM',
      message: 'No Aadhaar number provided for guarantor',
    });
  } else {
    // Basic Aadhaar format validation (12 digits)
    const aadhaar = guarantorData.aadhaar.replace(/\D/g, '');
    if (aadhaar.length !== 12) {
      scores.identity_score -= 30;
      flags.push({
        type: 'INVALID_AADHAAR_FORMAT',
        severity: 'HIGH',
        message: 'Aadhaar number is not 12 digits',
      });
    }
    // Verhoeff algorithm check (first digit shouldn't be 0 or 1)
    if (/^[01]/.test(aadhaar)) {
      scores.identity_score -= 15;
      flags.push({
        type: 'SUSPICIOUS_AADHAAR',
        severity: 'MEDIUM',
        message: 'Aadhaar number starts with an unusual digit',
      });
    }
  }

  // 5. Guarantor completeness check
  if (!guarantorData.full_name || guarantorData.full_name.trim().length < 3) {
    scores.guarantor_check_score -= 20;
    flags.push({
      type: 'INCOMPLETE_NAME',
      severity: 'LOW',
      message: 'Guarantor name is too short or missing',
    });
  }

  if (!guarantorData.address || guarantorData.address.trim().length < 10) {
    scores.guarantor_check_score -= 10;
    flags.push({
      type: 'MISSING_ADDRESS',
      severity: 'LOW',
      message: 'Guarantor address is missing or too short',
    });
  }

  // Calculate overall score (weighted average)
  const overallScore = Math.max(0, Math.min(100, Math.round(
    scores.guarantor_check_score * 0.15 +
    scores.duplicate_check_score * 0.25 +
    scores.email_pattern_score * 0.20 +
    scores.phone_pattern_score * 0.15 +
    scores.identity_score * 0.25
  )));

  // Determine risk level
  let riskLevel;
  if (overallScore >= 75) riskLevel = 'LOW';
  else if (overallScore >= 45) riskLevel = 'MEDIUM';
  else riskLevel = 'HIGH';

  // Generate recommendations
  const recommendations = [];
  if (riskLevel === 'HIGH') {
    recommendations.push('Manual verification strongly recommended before proceeding');
    recommendations.push('Contact guarantor directly to verify identity');
  }
  if (flags.some(f => f.type === 'DUPLICATE_GUARANTOR_EMAIL')) {
    recommendations.push('Consider requesting an alternative guarantor');
  }
  if (flags.some(f => f.type === 'MISSING_AADHAAR' || f.type === 'INVALID_AADHAAR_FORMAT')) {
    recommendations.push('Request valid Aadhaar documentation from guarantor');
  }
  if (riskLevel === 'LOW') {
    recommendations.push('All checks passed — safe to proceed');
  }

  return {
    overall_score: overallScore,
    risk_level: riskLevel,
    ...scores,
    flags,
    recommendations,
  };
}

// ============================================================
// PDF GENERATION
// ============================================================

/**
 * Generate a professional Loan Agreement PDF
 */
export function generateAgreementPDF(agreementData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = 20;

  // Helper to add centered text
  const addCenteredText = (text, yPos, size = 12, style = 'normal') => {
    doc.setFontSize(size);
    doc.setFont('helvetica', style);
    doc.text(text, pageWidth / 2, yPos, { align: 'center' });
  };

  // Helper to add left text
  const addText = (text, x, yPos, size = 10, style = 'normal') => {
    doc.setFontSize(size);
    doc.setFont('helvetica', style);
    doc.text(text, x, yPos);
  };

  // Helper to draw a line
  const drawLine = (yPos) => {
    doc.setDrawColor(99, 102, 241);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, pageWidth - margin, yPos);
  };

  // ---- HEADER ----
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 45, 'F');
  
  doc.setTextColor(99, 102, 241);
  addCenteredText('FINTRUST', 18, 22, 'bold');
  doc.setTextColor(226, 232, 240);
  addCenteredText('VERIFIED LOAN AGREEMENT', 30, 14, 'bold');
  doc.setTextColor(148, 163, 184);
  addCenteredText(`Agreement ID: ${agreementData.id?.slice(0, 8).toUpperCase() || 'DRAFT'}`, 40, 9);

  y = 55;
  doc.setTextColor(30, 30, 30);

  // ---- AGREEMENT INFO ----
  addText('Date of Agreement:', margin, y, 10, 'bold');
  addText(new Date().toLocaleDateString('en-IN', { 
    year: 'numeric', month: 'long', day: 'numeric' 
  }), margin + 50, y);
  y += 7;
  
  addText('Agreement Status:', margin, y, 10, 'bold');
  const statusDisplayMap = {
    'draft': 'DRAFT',
    'pending_guarantor': 'PENDING GUARANTOR',
    'pending_borrower_signature': 'PENDING SIGNATURE',
    'pending_lender_review': 'AWAITING LENDER APPROVAL',
    'pending_lender_signature': 'LENDER SIGNING',
    'active': 'ACTIVE - APPROVED',
    'completed': 'COMPLETED',
    'rejected': 'REJECTED',
    'cancelled': 'CANCELLED',
  };
  addText(statusDisplayMap[agreementData.status] || agreementData.status?.toUpperCase() || 'DRAFT', margin + 50, y);
  y += 12;

  drawLine(y);
  y += 10;

  // ---- LOAN TERMS ----
  addCenteredText('LOAN TERMS & CONDITIONS', y, 13, 'bold');
  y += 10;

  const loanTerms = [
    ['Principal Amount', `Rs. ${Number(agreementData.principal_amount || 0).toLocaleString('en-IN')}`],
    ['Interest Rate', `${agreementData.interest_rate || 0}% per annum`],
    ['Tenure', `${agreementData.tenure_months || 1} month(s)`],
    ['Repayment Schedule', agreementData.repayment_schedule?.replace('_', ' ').toUpperCase() || 'MONTHLY'],
    ['Currency', agreementData.currency || 'INR'],
    ['Purpose', agreementData.purpose || 'Personal Loan'],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Term', 'Details']],
    body: loanTerms,
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 4 },
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: margin, right: margin },
  });

  y = doc.lastAutoTable.finalY + 15;

  // ---- BORROWER DETAILS ----
  addCenteredText('BORROWER DETAILS', y, 13, 'bold');
  y += 10;

  const borrower = agreementData.parties?.find(p => p.role === 'borrower') || {};
  const borrowerDetails = [
    ['Full Name', borrower.full_name || 'N/A'],
    ['Email', borrower.email || 'N/A'],
    ['Phone', borrower.phone || 'N/A'],
    ['Aadhaar', borrower.aadhaar ? `XXXX-XXXX-${borrower.aadhaar.slice(-4)}` : 'N/A'],
    ['Address', borrower.address || 'N/A'],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Field', 'Value']],
    body: borrowerDetails,
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 4 },
    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [240, 253, 244] },
    margin: { left: margin, right: margin },
  });

  y = doc.lastAutoTable.finalY + 15;

  // ---- LENDER DETAILS ----
  // Ensure title + table stay on the same page (need ~70pt minimum)
  if (y > 220) {
    doc.addPage();
    y = 20;
  }
  addCenteredText('LENDER DETAILS', y, 13, 'bold');
  y += 10;

  const lender = agreementData.parties?.find(p => p.role === 'lender') || {};
  const lenderDetails = [
    ['Full Name', lender.full_name || 'N/A'],
    ['Email', lender.email || 'N/A'],
    ['Phone', lender.phone || 'N/A'],
    ['Aadhaar', lender.aadhaar ? `XXXX-XXXX-${lender.aadhaar.slice(-4)}` : 'N/A'],
    ['Address', lender.address || 'N/A'],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Field', 'Value']],
    body: lenderDetails,
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 4 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [239, 246, 255] },
    margin: { left: margin, right: margin },
  });

  y = doc.lastAutoTable.finalY + 15;

  // Check if we need a new page
  if (y > 230) {
    doc.addPage();
    y = 20;
  }

  // ---- GUARANTOR DETAILS ----
  const guarantor = agreementData.parties?.find(p => p.role === 'guarantor') || {};
  addCenteredText('GUARANTOR DETAILS', y, 13, 'bold');
  y += 10;

  const guarantorDetails = [
    ['Full Name', guarantor.full_name || 'N/A'],
    ['Email', guarantor.email || 'N/A'],
    ['Phone', guarantor.phone || 'N/A'],
    ['Aadhaar', guarantor.aadhaar ? `XXXX-XXXX-${guarantor.aadhaar.slice(-4)}` : 'N/A'],
    ['Address', guarantor.address || 'N/A'],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Field', 'Value']],
    body: guarantorDetails,
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 4 },
    headStyles: { fillColor: [245, 158, 11], textColor: 0, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [255, 251, 235] },
    margin: { left: margin, right: margin },
  });

  y = doc.lastAutoTable.finalY + 15;



  // ---- SIGNATURES SECTION ----
  if (y > 200) { doc.addPage(); y = 20; }

  drawLine(y);
  y += 10;
  addCenteredText('DIGITAL SIGNATURES', y, 13, 'bold');
  y += 15;

  // Borrower signature
  addText('Borrower Signature:', margin, y, 10, 'bold');
  y += 5;
  if (agreementData.borrowerSignature) {
    try {
      doc.addImage(agreementData.borrowerSignature, 'PNG', margin, y, 60, 25);
    } catch (e) {
      addText('[Digitally Signed]', margin, y + 10, 10, 'italic');
    }
  } else {
    doc.setDrawColor(200, 200, 200);
    doc.rect(margin, y, 60, 25);
    addText('Pending...', margin + 15, y + 14, 10, 'italic');
  }

  // Lender signature
  addText('Lender Signature:', pageWidth / 2, y - 5, 10, 'bold');
  if (agreementData.lenderSignature) {
    try {
      doc.addImage(agreementData.lenderSignature, 'PNG', pageWidth / 2, y, 60, 25);
    } catch (e) {
      addText('[Digitally Signed]', pageWidth / 2, y + 10, 10, 'italic');
    }
  } else {
    doc.setDrawColor(200, 200, 200);
    doc.rect(pageWidth / 2, y, 60, 25);
    addText('Pending...', pageWidth / 2 + 15, y + 14, 10, 'italic');
  }

  y += 35;

  // Timestamp
  y += 5;
  doc.setTextColor(130, 130, 130);
  addCenteredText(`Generated on ${new Date().toLocaleString('en-IN')} | FinTrust Verified Agreement System`, y, 8);
  addCenteredText('This is a digitally generated document. Any unauthorized alteration is prohibited.', y + 5, 7, 'italic');

  // ---- FOOTER on every page ----
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFillColor(15, 23, 42);
    doc.rect(0, pageH - 12, pageWidth, 12, 'F');
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(7);
    doc.text(`FinTrust | Page ${i} of ${totalPages}`, pageWidth / 2, pageH - 4, { align: 'center' });
  }

  return doc;
}


// ============================================================
// STORAGE & UPLOAD
// ============================================================

/**
 * Upload signature image to Supabase Storage
 */
export async function uploadSignature(signatureDataUrl, agreementId, role) {
  try {
    // Convert base64 to blob
    const response = await fetch(signatureDataUrl);
    const blob = await response.blob();
    
    const fileName = `${agreementId}/${role}_signature_${Date.now()}.png`;
    
    const { data, error } = await supabase.storage
      .from('agreement-signatures')
      .upload(fileName, blob, {
        contentType: 'image/png',
        upsert: true,
      });

    if (error) throw error;
    return { success: true, path: data.path };
  } catch (error) {
    console.error('Error uploading signature:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Upload PDF to Supabase Storage
 */
export async function uploadAgreementPDF(pdfDoc, agreementId) {
  try {
    const pdfBlob = pdfDoc.output('blob');
    const fileName = `${agreementId}/agreement_${Date.now()}.pdf`;

    const { data, error } = await supabase.storage
      .from('agreement-documents')
      .upload(fileName, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (error) throw error;

    // Save document record
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('agreement_documents').insert([{
      agreement_id: agreementId,
      document_type: 'agreement_pdf',
      file_name: `Agreement_${agreementId.slice(0, 8).toUpperCase()}.pdf`,
      file_path: data.path,
      file_size: pdfBlob.size,
      mime_type: 'application/pdf',
      storage_bucket: 'agreement-documents',
      uploaded_by: user.id,
    }]);

    return { success: true, path: data.path };
  } catch (error) {
    console.error('Error uploading PDF:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get signed URL for a document
 */
export async function getDocumentSignedURL(filePath, bucket = 'agreement-documents') {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (error) throw error;
    return { success: true, url: data.signedUrl };
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return { success: false, error: error.message };
  }
}


// ============================================================
// AGREEMENT LIFECYCLE
// ============================================================

/**
 * Create a new loan agreement
 */
export async function createAgreement(data) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Look up lender profile by email
    let lenderId = null;
    if (data.lenderEmail) {
      const { data: lenderProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', data.lenderEmail.toLowerCase())
        .single();
      lenderId = lenderProfile?.id || null;
    }

    // Create the agreement
    const { data: agreement, error } = await supabase
      .from('loan_agreements')
      .insert([{
        principal_amount: data.principalAmount,
        interest_rate: data.interestRate || 0,
        tenure_months: data.tenureMonths || 1,
        repayment_schedule: data.repaymentSchedule || 'monthly',
        currency: data.currency || 'INR',
        purpose: data.purpose || '',
        borrower_id: user.id,
        lender_id: lenderId,
        created_by: user.id,
        status: 'draft',
      }])
      .select()
      .single();

    if (error) throw error;

    // Insert parties
    const parties = [
      {
        agreement_id: agreement.id,
        role: 'borrower',
        user_id: user.id,
        full_name: data.borrowerName,
        email: data.borrowerEmail,
        phone: data.borrowerPhone || '',
        aadhaar: data.borrowerAadhaar || '',
        address: data.borrowerAddress || '',
      },
      {
        agreement_id: agreement.id,
        role: 'lender',
        user_id: lenderId,
        full_name: data.lenderName,
        email: data.lenderEmail,
        phone: data.lenderPhone || '',
        aadhaar: data.lenderAadhaar || '',
        address: data.lenderAddress || '',
      },
      {
        agreement_id: agreement.id,
        role: 'guarantor',
        full_name: data.guarantorName,
        email: data.guarantorEmail,
        phone: data.guarantorPhone || '',
        aadhaar: data.guarantorAadhaar || '',
        address: data.guarantorAddress || '',
      },
    ];

    const { error: partiesError } = await supabase
      .from('agreement_parties')
      .insert(parties);

    if (partiesError) throw partiesError;

    return { success: true, agreement };
  } catch (error) {
    console.error('Error creating agreement:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update an existing loan agreement
 */
export async function updateAgreement(agreementId, data) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Look up lender profile by email
    let lenderId = null;
    if (data.lenderEmail) {
      const { data: lenderProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', data.lenderEmail.toLowerCase())
        .single();
      lenderId = lenderProfile?.id || null;
    }

    // Update the agreement
    const { data: agreement, error } = await supabase
      .from('loan_agreements')
      .update({
        principal_amount: data.principalAmount,
        interest_rate: data.interestRate || 0,
        tenure_months: data.tenureMonths || 1,
        repayment_schedule: data.repaymentSchedule || 'monthly',
        currency: data.currency || 'INR',
        purpose: data.purpose || '',
        lender_id: lenderId,
      })
      .eq('id', agreementId)
      .select()
      .single();

    if (error) throw error;

    // Update parties
    // Note: This assumes parties already exist and replaces their info
    const roles = ['borrower', 'lender', 'guarantor'];
    for (const role of roles) {
      const partyData = {
        full_name: role === 'borrower' ? data.borrowerName : role === 'lender' ? data.lenderName : data.guarantorName,
        email: role === 'borrower' ? data.borrowerEmail : role === 'lender' ? data.lenderEmail : data.guarantorEmail,
        phone: role === 'borrower' ? data.borrowerPhone : role === 'lender' ? data.lenderPhone : data.guarantorPhone,
        aadhaar: role === 'borrower' ? data.borrowerAadhaar : role === 'lender' ? data.lenderAadhaar : data.guarantorAadhaar,
        address: role === 'borrower' ? data.borrowerAddress : role === 'lender' ? data.lenderAddress : data.guarantorAddress,
        user_id: role === 'borrower' ? user.id : role === 'lender' ? lenderId : null,
      };

      const { error: partyError } = await supabase
        .from('agreement_parties')
        .update(partyData)
        .eq('agreement_id', agreementId)
        .eq('role', role);

      if (partyError) throw partyError;
    }

    return { success: true, agreement };
  } catch (error) {
    console.error('Error updating agreement:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch full agreement details including parties, signatures, documents, risk
 */
export async function fetchAgreementDetails(agreementId) {
  try {
    const { data: agreement, error } = await supabase
      .from('loan_agreements')
      .select('*')
      .eq('id', agreementId)
      .single();

    if (error) throw error;

    // Fetch parties
    const { data: parties } = await supabase
      .from('agreement_parties')
      .select('*')
      .eq('agreement_id', agreementId);

    // Fetch signatures
    const { data: signatures } = await supabase
      .from('agreement_signatures')
      .select('*')
      .eq('agreement_id', agreementId);

    // Fetch documents
    const { data: documents } = await supabase
      .from('agreement_documents')
      .select('*')
      .eq('agreement_id', agreementId);

    // Fetch risk assessment
    const { data: riskAssessment } = await supabase
      .from('risk_assessments')
      .select('*')
      .eq('agreement_id', agreementId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return {
      success: true,
      data: {
        ...agreement,
        parties: parties || [],
        signatures: signatures || [],
        documents: documents || [],
        risk_assessment: riskAssessment || null,
      },
    };
  } catch (error) {
    console.error('Error fetching agreement details:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Save a risk assessment
 */
export async function saveRiskAssessment(agreementId, assessment) {
  try {
    const { data, error } = await supabase
      .from('risk_assessments')
      .insert([{
        agreement_id: agreementId,
        overall_score: assessment.overall_score,
        risk_level: assessment.risk_level,
        guarantor_check_score: assessment.guarantor_check_score,
        duplicate_check_score: assessment.duplicate_check_score,
        email_pattern_score: assessment.email_pattern_score,
        phone_pattern_score: assessment.phone_pattern_score,
        identity_score: assessment.identity_score,
        flags: assessment.flags,
        recommendations: assessment.recommendations,
      }])
      .select()
      .single();

    if (error) throw error;

    // Update agreement risk score
    await supabase
      .from('loan_agreements')
      .update({
        risk_score: assessment.overall_score,
        risk_level: assessment.risk_level,
      })
      .eq('id', agreementId);

    return { success: true, data };
  } catch (error) {
    console.error('Error saving risk assessment:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Save a digital signature
 */
export async function saveSignature(agreementId, signatureData) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Find the party record for this signer
    const { data: party } = await supabase
      .from('agreement_parties')
      .select('id, role')
      .eq('agreement_id', agreementId)
      .eq('user_id', user.id)
      .single();

    if (!party) throw new Error('You are not a party to this agreement');

    let signatureImageUrl = null;

    // Upload signature image if canvas type
    if (signatureData.type === 'canvas' && signatureData.image) {
      const uploadResult = await uploadSignature(signatureData.image, agreementId, party.role);
      if (uploadResult.success) {
        signatureImageUrl = uploadResult.path;
      }
    }

    // Generate signature hash
    const hashInput = `${agreementId}-${user.id}-${Date.now()}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(hashInput);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const signatureHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const { data: signature, error } = await supabase
      .from('agreement_signatures')
      .insert([{
        agreement_id: agreementId,
        party_id: party.id,
        signer_id: user.id,
        signature_type: signatureData.type,
        signature_image_url: signatureImageUrl,
        signature_hash: signatureHash,
        otp_verified: signatureData.type === 'otp',
        ip_address: signatureData.ipAddress || '',
        user_agent: navigator.userAgent,
      }])
      .select()
      .single();

    if (error) throw error;

    return { success: true, signature };
  } catch (error) {
    console.error('Error saving signature:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update agreement status
 */
export async function updateAgreementStatus(agreementId, status, extraFields = {}) {
  try {
    const updateData = { status, ...extraFields };
    
    if (status === 'active') {
      updateData.approved_at = new Date().toISOString();
    }
    if (['pending_lender_review', 'pending_lender_signature'].includes(status)) {
      updateData.signed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('loan_agreements')
      .update(updateData)
      .eq('id', agreementId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error updating agreement status:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch all agreements for the current user
 */
export async function fetchMyAgreements() {
  try {
    const { data, error } = await supabase
      .from('loan_agreements')
      .select(`
        *,
        agreement_parties (id, role, full_name, email),
        agreement_signatures (id, signer_id, signature_type, signed_at),
        risk_assessments (overall_score, risk_level)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error) {
    console.error('Error fetching agreements:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Complete agreement flow - generate PDF, upload, trigger email
 */
export async function completeAgreement(agreementId) {
  try {
    // Fetch full agreement details
    const detailsResult = await fetchAgreementDetails(agreementId);
    if (!detailsResult.success) throw new Error('Failed to fetch agreement details');

    const agreementData = detailsResult.data;

    // Fetch signature images for PDF
    let borrowerSig = null;
    let lenderSig = null;
    for (const sig of agreementData.signatures || []) {
      if (sig.signature_image_url) {
        const party = agreementData.parties.find(p => p.id === sig.party_id);
        const urlResult = await getDocumentSignedURL(sig.signature_image_url, 'agreement-signatures');
        if (urlResult.success && party) {
          if (party.role === 'borrower') borrowerSig = urlResult.url;
          if (party.role === 'lender') lenderSig = urlResult.url;
        }
      }
    }

    // Generate PDF
    const pdfDoc = generateAgreementPDF({
      ...agreementData,
      borrowerSignature: borrowerSig,
      lenderSignature: lenderSig,
    });

    // Upload PDF
    const uploadResult = await uploadAgreementPDF(pdfDoc, agreementId);
    if (!uploadResult.success) throw new Error('Failed to upload PDF');

    // Update agreement status
    await updateAgreementStatus(agreementId, 'active');

    // Try to trigger email (optional - depends on edge function)
    try {
      const pdfUrlResult = await getDocumentSignedURL(uploadResult.path);
      if (pdfUrlResult.success) {
        const borrower = agreementData.parties.find(p => p.role === 'borrower');
        const lender = agreementData.parties.find(p => p.role === 'lender');
        const guarantor = agreementData.parties.find(p => p.role === 'guarantor');

        await supabase.functions.invoke('send-agreement-email', {
          body: {
            agreementId,
            pdfUrl: pdfUrlResult.url,
            borrowerEmail: borrower?.email,
            lenderEmail: lender?.email,
            guarantorEmail: guarantor?.email,
            borrowerName: borrower?.full_name,
            lenderName: lender?.full_name,
            guarantorName: guarantor?.full_name,
            amount: agreementData.principal_amount,
          },
        });
      }
    } catch (emailError) {
      console.warn('Email sending failed (non-critical):', emailError);
    }

    return { 
      success: true, 
      pdfPath: uploadResult.path,
      pdfDoc 
    };
  } catch (error) {
    console.error('Error completing agreement:', error);
    return { success: false, error: error.message };
  }
}
