# CampusOne — Product-Ready College Management API Roadmap

## Goal

Build CampusOne as a real college ERP / SaaS platform, not just a CRUD API.

Recommended stack:

```text
React + TypeScript
        |
      REST
        |
Express / TypeScript API
        |
      Prisma
        |
   PostgreSQL + RLS
        |
      Redis
        |
    Job Queue
```

---

# 1. Product Architecture

```text
                         CAMPUSONE
                            |
       +--------------------+--------------------+
       |                    |                    |
   FOUNDATION            ACADEMICS            PEOPLE
       |                    |                    |
   Tenants              Programs             Students
   Authentication       Curriculum           Faculty
   Roles                Subjects             Parents
   Permissions           Classes             Staff
   Settings              Sections
   Audit Logs            Timetable
                        Attendance
                        Assignments
                        Exams
                        Marks
                            |
       +--------------------+--------------------+
       |                    |                    |
 COMMUNICATION         ADMINISTRATION        SERVICES
       |                    |                    |
 Announcements           Admissions             Fees
 Notifications          Documents              Leave
 Messaging              Certificates            Library
 Email                  ID Cards                Hostel
 Push                   Reports                 Transport
```

---

# 2. Institution Management

## Entities

```text
Tenant
College
Campus
Building
Block
Floor
Room
AcademicYear
Semester
Department
Program
Course
Batch
Section
```

## Hierarchy

```text
College
  |
  +-- Campus
  +-- Academic Years
  +-- Departments
       |
       +-- Programs
            |
            +-- Courses / Curriculum
                 |
                 +-- Batches
                      |
                      +-- Sections
```

## APIs

```text
GET    /api/v1/institution
PUT    /api/v1/institution

GET    /api/v1/academic-years
POST   /api/v1/academic-years
GET    /api/v1/academic-years/:id
PUT    /api/v1/academic-years/:id
DELETE /api/v1/academic-years/:id

GET    /api/v1/semesters
POST   /api/v1/semesters
PUT    /api/v1/semesters/:id

GET    /api/v1/campuses
GET    /api/v1/buildings
GET    /api/v1/rooms
```

---

# 3. Student Management — Student 360

```text
Student
|
+-- Personal Information
+-- Contact Information
+-- Address
+-- Guardian / Parent
+-- Admission
+-- Academic Details
+-- Documents
+-- Attendance
+-- Assignments
+-- Exams
+-- Marks
+-- Fees
+-- Leave
+-- Certificates
+-- Disciplinary Records
+-- Achievements
+-- Activities
+-- Notifications
+-- Audit History
```

## Important fields

```text
Student ID
Admission Number
Register Number
Roll Number
Date of Birth
Gender
Government ID
Nationality
Address
Emergency Contact
Guardian
Admission Category
Quota
Scholarship
Hostel Status
Transport Status
Current Academic Year
Current Semester
Current Section
Academic Status
```

## Student lifecycle

```text
APPLIED
  |
ADMITTED
  |
ACTIVE
  |
SUSPENDED / ON_LEAVE
  |
GRADUATED
  |
ALUMNI
```

---

# 4. Faculty Management

```text
Faculty
FacultyProfile
FacultyDepartment
FacultyDesignation
FacultyEmployment
FacultyQualification
FacultyExperience
FacultySubject
FacultyClass
FacultyTimetable
FacultyAttendance
FacultyLeave
FacultyDocument
```

Faculty 360:

```text
Faculty
|
+-- Personal Information
+-- Employee Information
+-- Department
+-- Designation
+-- Qualifications
+-- Experience
+-- Subjects
+-- Classes
+-- Timetable
+-- Attendance
+-- Leave
+-- Assignments
+-- Exams
+-- Documents
```

---

# 5. Academic Structure

```text
Department
    |
    +-- Program
          |
          +-- Curriculum
                |
                +-- Semester
                      |
                      +-- Subject
                            |
                            +-- Class / Section
```

## Subject

```text
Code
Name
Credits
Type
Theory / Practical
Department
Program
Semester
Faculty
```

Types:

```text
CORE
ELECTIVE
LAB
PROJECT
SEMINAR
PRACTICAL
```

---

# 6. Timetable

## Entities

```text
Timetable
TimetablePeriod
Room
FacultySchedule
ClassSchedule
```

## Fields

```text
Academic Year
Semester
Section
Subject
Faculty
Room
Day
Period
Start Time
End Time
```

## APIs

```text
GET    /api/v1/timetable
POST   /api/v1/timetable
PUT    /api/v1/timetable/:id
DELETE /api/v1/timetable/:id

GET    /api/v1/timetable/student/:studentId
GET    /api/v1/timetable/faculty/:facultyId
GET    /api/v1/timetable/class/:sectionId
```

## Conflict detection

Prevent:

```text
Faculty conflict
Room conflict
Class / Section conflict
Time conflict
```

---

# 7. Attendance

## Entities

```text
AttendanceSession
AttendanceRecord
AttendanceStatus
AttendanceCorrection
AttendanceApproval
AttendanceLock
```

## Statuses

```text
PRESENT
ABSENT
LATE
EXCUSED
ON_LEAVE
```

## Workflow

```text
DRAFT
  |
SUBMITTED
  |
LOCKED
```

Locked attendance must not be silently edited.

Corrections:

```text
Attendance Correction
        |
Approval
        |
Audit Log
```

## APIs

```text
POST   /api/v1/attendance/sessions
GET    /api/v1/attendance/sessions
POST   /api/v1/attendance/sessions/:id/records
PUT    /api/v1/attendance/records/:id
POST   /api/v1/attendance/sessions/:id/submit
POST   /api/v1/attendance/sessions/:id/lock

GET    /api/v1/attendance/student/:studentId
GET    /api/v1/attendance/section/:sectionId
GET    /api/v1/attendance/subject/:subjectId

GET    /api/v1/reports/attendance
```

---

# 8. Assignments

## Entities

```text
Assignment
AssignmentAttachment
AssignmentSubmission
AssignmentEvaluation
AssignmentFeedback
```

## Assignment

```text
Title
Description
Subject
Faculty
Class
Start Date
Due Date
Max Marks
Attachments
Status
```

## Submission

```text
Student
Assignment
Submitted At
Attachments
Status
Marks
Feedback
Evaluated By
```

Statuses:

```text
DRAFT
PUBLISHED
CLOSED
SUBMITTED
LATE
EVALUATED
```

---

# 9. Exams & Marks

## Entities

```text
Exam
ExamType
ExamSchedule
ExamRoom
ExamInvigilator
ExamRegistration
Marks
Grade
Result
SemesterResult
GPA
CGPA
Revaluation
SupplementaryExam
```

## Result flow

```text
Student
  |
Exam
  |
Subject
  |
Marks
  |
Grade
  |
Semester Result
  |
GPA
  |
CGPA
```

Special statuses:

```text
ABSENT
MALPRACTICE
WITHHELD
REVALUATION
SUPPLEMENTARY
```

Marks workflow:

```text
DRAFT
  |
SUBMITTED
  |
VERIFIED
  |
PUBLISHED
```

Published marks changes require authorization and an audit record.

---

# 10. Admissions

## Entities

```text
Applicant
AdmissionApplication
ApplicationDocument
ApplicationReview
AdmissionDecision
Offer
Enrollment
```

## Lifecycle

```text
APPLICATION
    |
DOCUMENT_VERIFICATION
    |
SHORTLISTED
    |
APPROVED
    |
OFFERED
    |
ACCEPTED
    |
ENROLLED
```

---

# 11. Fees & Finance

## Entities

```text
FeeStructure
FeeCategory
FeeInvoice
Payment
Refund
Discount
Scholarship
Fine
PaymentReceipt
PaymentTransaction
```

Categories:

```text
TUITION
HOSTEL
TRANSPORT
EXAM
LIBRARY
LAB
OTHER
```

Payment lifecycle:

```text
INVOICE
   |
PAYMENT_PENDING
   |
PAID
```

Support:

```text
PARTIAL_PAYMENT
OVERDUE
REFUND
WAIVER
SCHOLARSHIP
```

---

# 12. Announcements

Announcements should support targeted audiences.

Fields:

```text
Title
Content
Author
Audience
Department
Program
Batch
Section
Priority
Publish At
Expiry At
Attachments
```

Examples:

```text
CSE 3rd Year
    |
    +-- Exam Announcement
```

or:

```text
Entire College
    |
    +-- Holiday Announcement
```

---

# 13. Notifications

## Entities

```text
Notification
NotificationTemplate
NotificationPreference
NotificationDelivery
```

Channels:

```text
IN_APP
EMAIL
PUSH
SMS
```

Architecture:

```text
Business Event
     |
Notification Event
     |
Queue
     |
 +---+---+---+
 |   |   |   |
Push Email SMS In-App
```

Use background jobs instead of doing every notification synchronously.

---

# 14. Parent Portal

Parents should be first-class users.

```text
Parent
  |
  +-- Student Link
  +-- Student Link
```

A parent can have multiple children.

Access:

```text
Attendance
Marks
Assignments
Fees
Announcements
Leave
Timetable
Notifications
```

Parents must only access their linked students.

---

# 15. Documents

## Generic document system

```text
Document
+-- Owner
+-- Type
+-- File
+-- Version
+-- Uploaded By
+-- Verified By
+-- Status
+-- Expiry
```

Categories:

```text
Admission Documents
Student Documents
Faculty Documents
Certificates
ID Cards
Bonafide
Transfer Certificate
Conduct Certificate
Mark Sheets
```

Use object storage for files rather than storing large files in PostgreSQL.

---

# 16. Leave Management

## Entities

```text
LeaveType
LeaveRequest
LeaveApproval
LeaveBalance
```

## Workflow

```text
Student
  |
Leave Request
  |
Faculty / HOD
  |
Approve / Reject
  |
Attendance Updated
```

Leave and attendance should be integrated.

---

# 17. Student Activities

Support:

```text
Achievements
Events
Clubs
Sports
Competitions
Certificates
Internships
Activities
```

---

# 18. Placement Management

## Entities

```text
Company
JobOpening
PlacementDrive
EligibilityCriteria
StudentApplication
Interview
Offer
PlacementResult
```

## Flow

```text
Company
  |
Placement Drive
  |
Eligible Students
  |
Applications
  |
Interview
  |
Selected
  |
Offer
```

---

# 19. Hostel Management

```text
Hostel
HostelBuilding
Floor
Room
Bed
HostelAllocation
RoomTransfer
HostelFee
Visitor
HostelComplaint
Mess
```

Example:

```text
Hostel A
  |
  +-- Room 101
       |
       +-- Bed 1 -> Student
       +-- Bed 2 -> Student
       +-- Bed 3 -> Student
```

---

# 20. Transport Management

```text
Vehicle
Driver
Route
Stop
StudentTransport
FacultyTransport
Trip
```

---

# 21. Library Management

```text
Book
BookCopy
Author
Publisher
Category
LibraryMember
BookIssue
BookReturn
Fine
Reservation
```

---

# 22. ID Cards & Certificates

Support:

```text
Student ID Card
Faculty ID Card
Bonafide Certificate
Transfer Certificate
Conduct Certificate
Course Completion Certificate
Mark Sheet
Other Certificates
```

Include:

```text
Template
Version
GeneratedBy
GeneratedAt
Verification
Digital Signature / QR
```

---

# 23. RBAC — Role Based Access Control

Do not hardcode all permissions around roles.

## Entities

```text
Role
Permission
RolePermission
UserRole
```

## Example permissions

```text
STUDENT_READ
STUDENT_CREATE
STUDENT_UPDATE
STUDENT_DELETE

ATTENDANCE_READ
ATTENDANCE_MARK
ATTENDANCE_EDIT
ATTENDANCE_APPROVE

MARKS_READ
MARKS_ENTER
MARKS_EDIT
MARKS_VERIFY
MARKS_PUBLISH

FEES_READ
FEES_CREATE
PAYMENT_REFUND
```

## Roles

```text
SUPER_ADMIN
COLLEGE_ADMIN
DEPARTMENT_ADMIN
HOD
EXAM_ADMIN
FACULTY
STAFF
STUDENT
PARENT
```

Permissions should determine access.

---

# 24. Approval Workflow Engine

Use workflows for:

```text
Attendance Correction
Marks Modification
Student Admission
Leave Approval
Fee Waiver
Scholarship Approval
Document Verification
```

Generic entities:

```text
Workflow
WorkflowStep
ApprovalRequest
ApprovalAction
```

Example:

```text
Marks Modification
      |
    Faculty
      |
     HOD
      |
   Exam Cell
      |
   Approved
```

---

# 25. Audit Logs

Create a proper audit system.

## Entity

```text
AuditLog
```

Capture:

```text
Who
User ID
Tenant ID
Action
Entity
Entity ID
Timestamp
IP Address
User Agent
Request ID
Before
After
```

Example:

```text
ADMIN
changed
Student #123
Marks
45 -> 67
```

Sensitive actions must always be auditable.

---

# 26. Reports & Analytics

Reports:

```text
Student Strength
Attendance
Department Performance
Subject Performance
Exam Results
Faculty Workload
Admissions
Fees
Placement
Dropout
Academic Progress
```

Filters:

```text
Date Range
Department
Program
Batch
Semester
Section
Subject
```

Example APIs:

```text
GET /api/v1/reports/attendance
GET /api/v1/reports/student-performance
GET /api/v1/reports/department-performance
GET /api/v1/reports/examination
GET /api/v1/reports/fees
GET /api/v1/reports/admissions
GET /api/v1/reports/placements
```

---

# 27. Import / Export

Real colleges heavily use Excel.

Import:

```text
Students
Faculty
Subjects
Marks
Attendance
```

Export:

```text
Students
Attendance
Marks
Results
Fees
```

## Import flow

```text
Excel
  |
Upload
  |
Validate
  |
Preview
  |
Show Errors
  |
Confirm
  |
Import
```

Never insert an uploaded spreadsheet directly without validation.

---

# 28. Global Search

Search:

```text
Student Name
Admission Number
Register Number
Roll Number
Faculty
Department
Subject
Application Number
```

Example:

```text
Search CampusOne...

"2026CSE001"
      |
      +-- Student
      +-- Attendance
      +-- Marks
      +-- Fees
      +-- Documents
```

---

# 29. API Standards

## Versioning

```text
/api/v1/...
```

## Request ID

```text
X-Request-ID
```

## Structured logging

```text
requestId
tenantId
userId
method
path
status
duration
```

## Idempotency

Use idempotency keys for:

```text
Payments
Admissions
Marks Publishing
Notifications
Other financial / irreversible operations
```

## Filtering

```text
?search=
?status=
?departmentId=
?programId=
?batchId=
?sectionId=
?sortBy=
?sortOrder=
```

---

# 30. Background Jobs

Use Redis + a queue such as BullMQ.

Jobs:

```text
Email
Push Notifications
SMS
Report Generation
Excel Export
Bulk Student Import
Certificate Generation
Fee Reminders
Attendance Alerts
Scheduled Announcements
```

Architecture:

```text
API
 |
Event
 |
Redis Queue
 |
Worker
 |
External Service / Database
```

---

# 31. Scheduled Events

Create:

```text
AcademicCalendar
ExamDates
AssignmentDeadlines
AnnouncementSchedule
FeeDueDates
AttendanceReminderSchedule
```

Architecture:

```text
Scheduler
   |
Queue
   |
Worker
   |
Action
```

---

# 32. Multi-Tenant SaaS

Build the SaaS layer around tenant isolation.

## Entities

```text
Tenant
Subscription
Plan
Feature
FeatureLimit
TenantFeature
Billing
Usage
TenantSettings
```

Example plans:

```text
FREE
+-- 500 Students
+-- 5 Admins
+-- Basic Reports

PRO
+-- 5,000 Students
+-- 50 Admins
+-- Advanced Reports
+-- Notifications

ENTERPRISE
+-- Custom Limits
+-- SSO
+-- Advanced Integrations
+-- Dedicated Support
```

---

# 33. Integrations

Eventually support:

```text
Payment Gateway
Email Provider
SMS Provider
Firebase
Google Workspace
Microsoft 365
Biometric Attendance
Accounting Software
LMS
Library Systems
```

Integration infrastructure:

```text
API Keys
OAuth
Webhooks
Integration Settings
Webhook Events
Webhook Delivery Logs
```

---

# 34. Security Requirements

Required:

```text
JWT Access Tokens
Refresh Token Rotation
Refresh Token Hashing
Password Hashing
Account Lockout
Rate Limiting
CORS
Input Validation
Authorization
Tenant Isolation
PostgreSQL RLS
Audit Logging
Secure Headers
Request IDs
Structured Logging
Secret Management
```

Additional:

```text
Password Reset
Email Verification
MFA / 2FA
Session Management
Device Management
Login History
Suspicious Login Detection
```

---

# 35. Data Integrity

Use:

```text
Foreign Keys
Unique Constraints
Composite Unique Constraints
Check Constraints
Indexes
Transactions
Soft Delete where appropriate
CreatedAt / UpdatedAt
DeletedAt where required
Version / Optimistic Locking for critical entities
```

Critical operations should use transactions:

```text
Student Enrollment
Payment
Marks Publishing
Attendance Submission
Fee Refund
Admission Approval
```

---

# 36. Soft Delete & Archival

Consider soft deletion for:

```text
Students
Faculty
Departments
Subjects
Announcements
Documents
Users
```

Example:

```text
deletedAt
deletedBy
```

For immutable academic and financial records, prefer archival/status changes instead of deletion.

---

# 37. Database Design Principles

Every tenant-owned entity should include:

```text
tenantId
createdAt
updatedAt
```

Important entities should also include:

```text
createdBy
updatedBy
```

Composite uniqueness examples:

```text
tenantId + admissionNumber
tenantId + registerNumber
tenantId + departmentCode
tenantId + subjectCode
```

---

# 38. API Module Structure

```text
src/
|
+-- modules/
|    |
|    +-- auth/
|    +-- tenants/
|    +-- users/
|    +-- roles/
|    +-- permissions/
|    +-- institution/
|    +-- academic-years/
|    +-- departments/
|    +-- programs/
|    +-- courses/
|    +-- batches/
|    +-- sections/
|    +-- students/
|    +-- parents/
|    +-- faculty/
|    +-- subjects/
|    +-- timetable/
|    +-- attendance/
|    +-- assignments/
|    +-- examinations/
|    +-- marks/
|    +-- results/
|    +-- admissions/
|    +-- fees/
|    +-- announcements/
|    +-- notifications/
|    +-- documents/
|    +-- leave/
|    +-- hostel/
|    +-- transport/
|    +-- library/
|    +-- placements/
|    +-- reports/
|    +-- audit/
|    +-- workflows/
|    +-- billing/
|    +-- integrations/
|
+-- common/
|    +-- middleware/
|    +-- guards/
|    +-- validation/
|    +-- errors/
|    +-- logging/
|    +-- pagination/
|    +-- database/
|    +-- events/
|    +-- queue/
|
+-- config/
```

---

# 39. Testing Strategy

## Unit tests

Test:

```text
Business Rules
Validation
Calculations
Permissions
Attendance Percentage
GPA / CGPA
Fee Calculations
Eligibility
Workflow Rules
```

## Integration tests

Test:

```text
Database
Prisma
RLS
Transactions
Authentication
Authorization
```

## API tests

Test:

```text
Happy Paths
Validation Errors
Unauthorized
Forbidden
Not Found
Conflict
Pagination
Filtering
Tenant Isolation
```

Critical security test:

```text
Tenant A user
      X
Tenant B data
```

---

# 40. Observability

Production system should have:

```text
Structured Logs
Request IDs
Error Tracking
Metrics
Health Checks
Database Health
Redis Health
Queue Health
External Service Health
```

Endpoints:

```text
GET /health
GET /health/ready
GET /health/live
```

Track:

```text
Request Latency
Error Rate
Database Latency
Queue Size
Failed Jobs
API Throughput
```

---

# 41. Dashboard APIs

Dashboard must use real aggregated data.

Metrics:

```text
Total Students
Total Faculty
Departments
Active Classes
Attendance
Pending Admissions
Assignments
Upcoming Exams
Fees
Recent Announcements
Recent Activities
```

Use optimized aggregation queries rather than loading every student into application memory.

---

# 42. Release Plan

## Release 1 — Core ERP

```text
Authentication
Multi-Tenancy
Users
Roles
Permissions

College
Academic Year
Semester
Departments
Programs
Courses
Batches
Sections

Students
Faculty
Subjects
Classes
Timetable

Dashboard
Audit Logs
Notifications
```

## Release 2 — Academic Management

```text
Attendance
Assignments
Exams
Marks
Grades
Results
Reports

Leave
Announcements
Documents
Import / Export
```

## Release 3 — College Operations

```text
Admissions
Fees
Payments
Scholarships

Hostel
Transport
Library

Certificates
Student Activities
Placements
```

## Release 4 — Enterprise SaaS

```text
Subscriptions
Billing
Usage Limits

SSO
MFA
API Keys
Webhooks
Integrations

Advanced Analytics
Workflow Engine
Approval System
Background Jobs
```

---

# 43. Priority Order

Implement in this order:

```text
1. Institution / Academic hierarchy
2. Students
3. Faculty
4. Programs / Courses / Subjects
5. Batches / Sections
6. Timetable
7. RBAC / Permissions
8. Attendance
9. Assignments
10. Exams
11. Marks / Results
12. Announcements
13. Notifications
14. Documents
15. Leave
16. Admissions
17. Fees
18. Reports
19. Import / Export
20. Audit / Workflows
21. Parent Portal
22. Hostel
23. Transport
24. Library
25. Placements
26. SaaS Billing
27. Integrations
```

---

# 44. Definition of Product-Ready

## Security

```text
[ ] Authentication
[ ] Refresh token rotation
[ ] Password reset
[ ] MFA
[ ] RBAC
[ ] Tenant isolation
[ ] PostgreSQL RLS
[ ] Rate limiting
[ ] Secure headers
[ ] Audit logs
```

## Data

```text
[ ] Foreign keys
[ ] Unique constraints
[ ] Indexes
[ ] Transactions
[ ] Soft delete / archival
[ ] Optimistic locking where needed
[ ] Backup strategy
```

## API

```text
[ ] /api/v1
[ ] Pagination
[ ] Filtering
[ ] Sorting
[ ] Search
[ ] Idempotency
[ ] Request IDs
[ ] Standard errors
[ ] Validation
```

## Operations

```text
[ ] Background jobs
[ ] Scheduled jobs
[ ] Health checks
[ ] Logs
[ ] Metrics
[ ] Error tracking
[ ] Queue monitoring
```

## Product

```text
[ ] Student 360
[ ] Faculty 360
[ ] Academic management
[ ] Attendance
[ ] Assignments
[ ] Exams
[ ] Marks
[ ] Results
[ ] Admissions
[ ] Fees
[ ] Notifications
[ ] Reports
[ ] Documents
[ ] Import / Export
```

---

# 45. Key Product Principle

Do not turn every feature into a simple CRUD endpoint.

For example, attendance should not just be:

```text
POST /attendance
```

Instead:

```text
Create Attendance Session
        |
Add / Update Records
        |
Submit
        |
Lock
        |
Correction Request
        |
Approval
        |
Audit
```

Marks should similarly follow:

```text
Marks
  |
Draft
  |
Submit
  |
Verify
  |
Publish
  |
Correction Request
  |
Approval
  |
Audit
```

This is what separates a college ERP from a basic CRUD application.

---

# 46. Final Student Lifecycle

The final platform should manage:

```text
Applicant
   ↓
Admission
   ↓
Student
   ↓
Department / Program
   ↓
Batch / Section
   ↓
Subjects / Classes
   ↓
Timetable
   ↓
Attendance
   ↓
Assignments
   ↓
Exams
   ↓
Marks
   ↓
Results / GPA / CGPA
   ↓
Fees / Documents / Activities
   ↓
Graduation
   ↓
Alumni
```

And simultaneously manage:

```text
College
Departments
Faculty
Parents
Administration
Finance
Communication
Hostel
Transport
Library
Placements
Reports
SaaS Billing
```

---

# 47. Implementation Rule

Do not build hundreds of endpoints before finalizing the domain model.

Recommended next sequence:

```text
1. Finalize domain entities
2. Design PostgreSQL / Prisma relationships
3. Add Institution + Academic hierarchy
4. Upgrade Student to Student 360
5. Add Faculty
6. Add Programs / Courses / Subjects / Batches / Sections
7. Implement RBAC permissions
8. Build Timetable
9. Implement Attendance
10. Continue through the release plan
```

The database relationships should be finalized before the API grows significantly.

**Target:** a multi-tenant, production-grade college management SaaS rather than a simple student CRUD application.
