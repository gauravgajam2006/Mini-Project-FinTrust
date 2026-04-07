// @ts-nocheck
// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { 
      agreementId, 
      pdfUrl, 
      borrowerEmail, 
      lenderEmail, 
      guarantorEmail,
      borrowerName, 
      lenderName,
      guarantorName,
      amount 
    } = await req.json()

    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not set in environment variables.')
    }

    // Step 1: Download the PDF from the signed URL
    console.log(`Downloading PDF for the email attachment...`)
    const pdfResponse = await fetch(pdfUrl)
    if (!pdfResponse.ok) {
      throw new Error(`Failed to download PDF: ${pdfResponse.statusText}`)
    }
    
    // Safely convert PDF ArrayBuffer to Base64
    const pdfArrayBuffer = await pdfResponse.arrayBuffer()
    const uint8Array = new Uint8Array(pdfArrayBuffer)
    let binaryString = ''
    for (let i = 0; i < uint8Array.length; i++) {
      binaryString += String.fromCharCode(uint8Array[i])
    }
    const base64Pdf = btoa(binaryString)

    // Step 2: Prepare Email Addresses
    // Resend docs say default test API keys can only send to your registered email addressing.
    // Assuming standard usage or production environment here, where domains are verified.
    const toEmails = [borrowerEmail, lenderEmail, guarantorEmail].filter(Boolean)
    
    if (toEmails.length === 0) {
      throw new Error('No recipient emails found')
    }

    console.log(`Sending emails to: ${toEmails.join(', ')}`)

    // Step 3: Send emails via Resend API
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        // UPDATE THIS 'from' address to your verified domain on Resend in production
        from: 'FinTrust Agreements <onboarding@resend.dev>', 
        to: toEmails,
        subject: `Your Verified Loan Agreement: ${agreementId.slice(0,8).toUpperCase()} is Ready`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.5; color: #333;">
            <div style="background-color: #0f172a; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: #6366f1; margin: 0;">FINTRUST</h1>
            </div>
            <div style="padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
              <h2>Loan Agreement Finalized</h2>
              <p>The loan agreement has been successfully approved and signed by all parties.</p>
              
              <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 10px; font-weight: bold;">Agreement ID</td>
                  <td style="padding: 10px;">${agreementId.slice(0,8).toUpperCase()}</td>
                </tr>
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 10px; font-weight: bold;">Borrower</td>
                  <td style="padding: 10px;">${borrowerName}</td>
                </tr>
                <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 10px; font-weight: bold;">Lender</td>
                  <td style="padding: 10px;">${lenderName}</td>
                </tr>
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 10px; font-weight: bold;">Guarantor</td>
                  <td style="padding: 10px;">${guarantorName}</td>
                </tr>
                <tr style="background-color: #f8fafc;">
                  <td style="padding: 10px; font-weight: bold; color: #10b981;">Principal Amount</td>
                  <td style="padding: 10px; font-weight: bold; color: #10b981;">₹${Number(amount).toLocaleString('en-IN')}</td>
                </tr>
              </table>
              
              <p>Please find the final, digitally signed PDF agreement attached to this email.</p>
              <p>This is an automated email with legally binding documents. Please store them securely.</p>
              
              <p style="margin-top: 30px; font-size: 14px; color: #64748b;">Thank you for using FinTrust.</p>
            </div>
          </div>
        `,
        attachments: [
          {
            filename: `FinTrust_Agreement_${agreementId.slice(0,8).toUpperCase()}.pdf`,
            content: base64Pdf,
          }
        ]
      }),
    })

    const resData = await res.json()

    if (!res.ok) {
      throw new Error(`Resend API Error: ${JSON.stringify(resData)}`)
    }

    return new Response(
      JSON.stringify({ success: true, data: resData }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Error sending agreement email:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})
