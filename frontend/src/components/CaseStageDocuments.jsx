/**

 * Stage document templates: download → complete offline → upload → send to employee.

 */



export default function CaseStageDocuments({

  templates = [],

  missingDocuments = [],

  sharePointConfigured = false,

  sharePointPath = '',

  sharePointFolderConfirmed = false,

  uploading = false,

  saving = false,

  onDownloadTemplate,

  onUploadForTemplate,

  onIssueToEmployee,

  documentsBlock = null,

}) {

  if (!templates.length && !documentsBlock) return null;



  return (

    <div className="rounded-xl border border-[#1a2540] bg-[#060e1a]/40 p-4 space-y-4">

      <div>

        <h4 className="text-sm font-semibold text-white">Stage documents</h4>

        <p className="text-xs text-slate-400 mt-1">

          Download a pre-filled working copy for letters and outcome documents, complete in Word, upload, then send to the employee.

          Interview notes are recorded on the portal — not via Word upload.

          Masters live in SharePoint{' '}

          <span className="text-slate-300">Employee Files/HR Form Templates/Disciplinaries</span>.

          Completed files are stored in this employee’s Disciplinaries &amp; Grievances case folder.

        </p>

        {sharePointPath && (

          <p className="text-[11px] text-slate-500 mt-1 break-all">

            Case folder: {sharePointPath}

            {!sharePointFolderConfirmed ? ' (folder mapping not confirmed — check employee Documents tab)' : ''}

          </p>

        )}

        {!sharePointConfigured && (

          <p className="text-xs text-amber-300 mt-1">SharePoint is not configured — template download/upload needs Graph credentials.</p>

        )}

      </div>



      {missingDocuments.length > 0 && (

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">

          Required before continuing: {missingDocuments.map((item) => item.title).join(', ')}

        </div>

      )}



      <ul className="space-y-3">

        {templates.map((template) => {

          const uploaded = template.uploadedDocument;

          const alreadySent = Boolean(uploaded?.issuedToEmployeeAt || uploaded?.issuedMinutesId);

          return (

            <li key={template.id} className="rounded-lg border border-[#1a2540] bg-[#0b1220] p-3 space-y-2">

              <div className="flex items-start justify-between gap-3 flex-wrap">

                <div>

                  <p className="text-sm text-white font-medium">

                    {template.title}

                    {template.required ? (

                      <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-300">Required</span>

                    ) : (

                      <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-500">Optional</span>

                    )}

                  </p>

                  <p className="text-xs text-slate-400 mt-0.5">{template.description}</p>

                  <p className="text-[11px] text-slate-500 mt-1">

                    Master: {template.sharePointTemplateFileName || (template.sharePointFileNames || [])[0] || 'Templates library'}

                    {template.sharePointTemplateAvailable === false && (

                      <span className="text-amber-300"> — not found yet (first download can create a starter file for HR to replace)</span>

                    )}

                    {template.sharePointTemplateWebUrl && (

                      <>

                        {' · '}

                        <a href={template.sharePointTemplateWebUrl} target="_blank" rel="noreferrer" className="text-indigo-300 underline">

                          Open master

                        </a>

                      </>

                    )}

                  </p>

                  {template.satisfiedByPortalInterview && (
                    <p className="text-xs text-emerald-300 mt-1">
                      Interview notes recorded on the portal for this stage.
                    </p>
                  )}

                  {template.uploaded && uploaded && (

                    <p className="text-xs text-emerald-300 mt-1">

                      Uploaded: {uploaded.fileName}

                      {uploaded.sharePointWebUrl && (

                        <>

                          {' · '}

                          <a

                            href={uploaded.sharePointWebUrl}

                            target="_blank"

                            rel="noreferrer"

                            className="underline"

                          >

                            Open in SharePoint

                          </a>

                        </>

                      )}

                      {alreadySent && (

                        <span className="text-indigo-300">

                          {' · '}Sent to employee

                          {uploaded.employeeReviewStatus ? ` (${uploaded.employeeReviewStatus})` : ''}

                        </span>

                      )}

                    </p>

                  )}

                </div>

                <div className="flex flex-wrap gap-2">

                  <button

                    type="button"

                    className="px-3 py-1.5 text-sm border border-[#1a2540] rounded-lg text-slate-200 hover:bg-[#060e1a]"

                    disabled={saving || uploading}

                    onClick={() => onDownloadTemplate?.(template)}

                  >

                    Download pre-filled

                  </button>

                  <label className={`px-3 py-1.5 text-sm rounded-lg text-white font-medium cursor-pointer ${

                    uploading ? 'bg-indigo-600/50' : 'bg-indigo-600 hover:bg-indigo-500'

                  }`}>

                    {uploading ? 'Uploading…' : (template.uploaded ? 'Replace upload' : 'Upload completed')}

                    <input

                      type="file"

                      className="hidden"

                      disabled={uploading || saving}

                      onChange={(event) => onUploadForTemplate?.(template, event)}

                    />

                  </label>

                  {template.uploaded && onIssueToEmployee && (

                    <button

                      type="button"

                      className="px-3 py-1.5 text-sm rounded-lg border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50"

                      disabled={saving || uploading || alreadySent || !uploaded?.id}

                      onClick={() => onIssueToEmployee(template)}

                    >

                      {alreadySent ? 'Sent to employee' : 'Send to employee'}

                    </button>

                  )}

                </div>

              </div>

            </li>

          );

        })}

      </ul>



      {documentsBlock && (

        <div className="border-t border-[#1a2540] pt-4">

          <p className="text-xs uppercase text-slate-500 mb-2">Other evidence / files</p>

          {documentsBlock}

        </div>

      )}

    </div>

  );

}


