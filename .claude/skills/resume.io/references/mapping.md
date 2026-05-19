# resume.io API → RESUME schema

Endpoint: GET https://resume.io/api/app/resumes/{id}   (credentials: include)

Response is a flat JSON object. Map fields as follows.


## meta

| RESUME field        | Source                                                         |
|---------------------|----------------------------------------------------------------|
| meta.accent         | color                                                          |
| meta.sectionsOrder  | sectionsOrder filtered to main-column sections                 |
| meta.sidebarOrder   | constant ["details","links","skills","languages","hobbies"]    |

Main-column whitelist: profile, workExperiences, educations, custom:*
Anything starting with "custom:" is kept verbatim — the suffix is the custom section id.


## header

| RESUME field    | Source                                                |
|-----------------|-------------------------------------------------------|
| header.fullName | name  OR  `${firstName} ${lastName}`                  |
| header.role     | position                                              |
| header.avatar   | avatar.largeUrl   (omit if includeAvatar is false)    |


## details (sidebar)

| Key      | Source                                                           |
|----------|------------------------------------------------------------------|
| Location | [city, countryName].filter(Boolean).join(", ")                   |
| Phone    | phoneNumber                                                      |
| Email    | { text: email, href: "mailto:" + email }                         |
| Born     | [birthDate, birthPlace].filter(Boolean).join(", ")               |

Skip any key whose source value is empty.


## links

From socialProfiles[]:

    {
      label: profile.label || profile.network,
      text:  profile.url ? humanize(profile.url) : "",
      href:  profile.url || ""
    }

humanize(url) = strip protocol and trailing slash for display.


## skills

From skills[]:

    { name: s.skill, level: s.level }

Drop entries where level is null. Preserve "position" order.

Allowed level values: beginner | skillful | experienced | expert


## languages

From languages[]:

    { name: l.language, level: l.level }

Preserve "position" order.

Allowed level values:
elementary | low_intermediate | upper_intermediate | advanced | native


## hobbies

hobbies (string, HTML). May be empty.


## profile

profile (HTML). Pass through as-is.


## work

From workExperiences[] sorted by position ascending:

    title:    `${w.title}, ${w.employer}`        // omit ", employer" if missing
    meta:     `${fmt(w.dateFrom)} — ${w.isDateUntilPresent ? "Present" : fmt(w.dateUntil)}`
    location: w.city || ""
    body:     w.description    // HTML, pass through

fmt("2022-06-01") returns "Jun 2022".
Year-only inputs are kept as years.


## education

From educations[]:

    title:    `${e.degree} — ${e.school}`       // either side may be missing
    meta:     same date format as work (no "Present" for education unless flagged)
    location: e.city || ""
    body:     e.description    // HTML, pass through


## custom

From customSections[], keyed by a slug derived from c.title:

    custom[slug(c.title)] = {
      heading: c.title,
      items: c.items.map(it => ({
        title:    [it.title, it.subtitle].filter(Boolean).join(" — "),
        meta:     (it.dateFrom || it.dateUntil) ? formatRange(it.dateFrom, it.dateUntil) : "",
        location: it.city || "",
        body:     it.description
      }))
    }

The custom section id in sectionsOrder (e.g. "custom:1348646928") maps to its
slug via the same array index — render in the order given by sectionsOrder.


## Date formatter

    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    function fmt(iso) {
      if (!iso) return "";
      // year-only stored as "YYYY"
      if (/^\d{4}$/.test(iso)) return iso;
      return `${MONTHS[+iso.slice(5,7) - 1]} ${iso.slice(0,4)}`;
    }

    function formatRange(from, until) {
      const a = fmt(from), b = fmt(until);
      if (a && b) return `${a} — ${b}`;
      return a || b || "";
    }


## Fields ignored on purpose

score, renderingToken, templateConfig (already encoded), templateSettings,
motivation, pr, qualifications, technicalSkills (legacy),
companyName, jobTitle, linkedin (top-level legacy), powerStatement,
accomplishments, publications (toggle on if user enables them later),
aiTaskId, autoTailored, averageScore, rbSectionsOrderVariant,
trOrderId, aiJobStatus, aiJobType, jobCardId, jobPostingId, originalResumeId.


## Schema version

v1 — resume.io API as of May 2026, flat top-level JSON.
If the API shape changes, bump to v2 and update the tables above.