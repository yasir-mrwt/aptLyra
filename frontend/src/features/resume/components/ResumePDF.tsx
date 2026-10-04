import { Document, Page, Text, View, StyleSheet, Link } from '@react-pdf/renderer';
import type { ParsedProfile } from '../types';

const ACCENT_COLOR = '#2563EB'; // Royal Blue
const TEXT_MAIN = '#1F2937';
const TEXT_MUTED = '#4B5563';

// ATS-friendly styling
const styles = StyleSheet.create({
  page: {
    paddingTop: 35,
    paddingBottom: 40,
    paddingHorizontal: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    lineHeight: 1.5,
    color: TEXT_MAIN,
  },
  header: {
    marginBottom: 15,
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  name: {
    fontSize: 26,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
    textTransform: 'uppercase',
    lineHeight: 1.2,
    color: ACCENT_COLOR,
    letterSpacing: 1.5,
  },
  contactInfo: {
    fontSize: 9.5,
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 4,
    color: TEXT_MUTED,
  },
  contactItem: {
    marginHorizontal: 5,
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    borderBottomWidth: 1.5,
    borderBottomColor: ACCENT_COLOR,
    paddingBottom: 4,
    marginBottom: 10,
    color: '#111827',
    letterSpacing: 0.5,
  },
  text: {
    fontSize: 10,
    marginBottom: 4,
  },
  bold: {
    fontFamily: 'Helvetica-Bold',
  },
  experienceItem: {
    marginBottom: 8,
  },
  experienceHeader: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  experienceTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
  },
  experienceCompany: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    color: ACCENT_COLOR,
  },
  experienceDate: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: TEXT_MUTED,
  },
  bulletPoint: {
    display: 'flex',
    flexDirection: 'row',
    marginBottom: 2,
    paddingLeft: 10,
  },
  bullet: {
    width: 10,
  },
  bulletText: {
    flex: 1,
  },
  skillsGroup: {
    marginBottom: 4,
  },
});

interface ExtendedProfile extends ParsedProfile {
  skills?: {
    technical?: string[];
    soft?: string[];
  };
}

interface ResumePDFProps {
  profile: ExtendedProfile;
}

export const ResumePDF = ({ profile }: ResumePDFProps) => {
  const { personal_info, summary, experience = [], education = [] } = profile;

  // Extract skills (since they might be passed within profile or externally, we'll try to get them if they exist or pass them separately. Let's assume they are handled.)
  // Actually, standard `ParsedProfile` doesn't strictly have `skills` at the top level, but it might be passed into EntityExtractionTab. 
  // Let's type cast or pass them down in a generic way. We will expect `profile.skills` if added.

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* Contact Info Header */}
        <View style={styles.header}>
          <Text style={styles.name}>{personal_info?.name || "YOUR NAME"}</Text>
          <View style={styles.contactInfo}>
            {personal_info?.email && <Text style={styles.contactItem}>{personal_info.email}</Text>}
            {personal_info?.phone && <Text style={styles.contactItem}>| {personal_info.phone}</Text>}
            {personal_info?.location && <Text style={styles.contactItem}>| {personal_info.location}</Text>}
          </View>
          {personal_info?.links && personal_info.links.length > 0 && (
            <View style={{ ...styles.contactInfo, gap: 12 }}>
              {(() => {
                const links = personal_info.links || [];
                
                // Find primary LinkedIn link
                const linkedinLink = links.find(link => link.toLowerCase().includes('linkedin.com'));
                
                // Find primary GitHub link (prioritize profile links over repo links)
                const githubLinks = links.filter(link => link.toLowerCase().includes('github.com'));
                let githubLink = githubLinks.find(link => {
                  try {
                    const urlStr = link.startsWith('http') ? link : `https://${link}`;
                    const urlObj = new URL(urlStr);
                    return urlObj.pathname.split('/').filter(Boolean).length === 1;
                  } catch {
                    return false;
                  }
                });
                
                if (!githubLink && githubLinks.length > 0) {
                  githubLink = githubLinks[0];
                }

                const displayLinks = [
                  githubLink ? { url: githubLink, type: 'github' } : null,
                  linkedinLink ? { url: linkedinLink, type: 'linkedin' } : null
                ].filter(Boolean) as { url: string, type: 'github' | 'linkedin' }[];

                return displayLinks.map((item, i) => (
                  <Link key={i} src={item.url.startsWith("http") ? item.url : `https://${item.url}`} style={{...styles.contactItem, color: ACCENT_COLOR, textDecoration: 'none'}}>
                    {item.type === 'github' ? 'GitHub' : 'LinkedIn'}
                  </Link>
                ));
              })()}
            </View>
          )}
        </View>

        {/* Summary */}
        {summary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Professional Summary</Text>
            <Text style={styles.text}>{summary}</Text>
          </View>
        )}

        {/* Skills */}
        {profile.skills?.technical && profile.skills.technical.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Technical Skills</Text>
            <Text style={styles.text}>
              <Text style={styles.bold}>Core Competencies: </Text>
              {profile.skills.technical.join(", ")}
            </Text>
            {/* If soft skills exist */}
            {profile.skills?.soft && profile.skills.soft.length > 0 && (
              <Text style={styles.text}>
                <Text style={styles.bold}>Soft Skills: </Text>
                {profile.skills.soft.join(", ")}
              </Text>
            )}
          </View>
        )}

        {/* Experience */}
        {experience && experience.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Experience</Text>
            {experience.map((exp, idx) => (
              <View key={idx} style={styles.experienceItem}>
                <View style={styles.experienceHeader}>
                  <Text style={styles.experienceTitle}>
                    {exp.role || exp.title || "Role"}
                    {exp.company && <Text style={styles.experienceCompany}> | {exp.company}</Text>}
                  </Text>
                  <Text style={styles.experienceDate}>{exp.duration || ""}</Text>
                </View>
                {exp.location && <Text style={{ ...styles.text, fontFamily: 'Helvetica-Oblique', marginBottom: 4 }}>{exp.location}</Text>}
                
                {exp.description && exp.description.split(/(?:\n|•)/).filter(b => b.trim().length > 3).map((bullet, bIdx) => (
                  <View key={bIdx} style={styles.bulletPoint}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.bulletText}>{bullet.trim()}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Projects */}
        {profile.projects && profile.projects.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Projects</Text>
            {profile.projects.map((proj, idx) => (
              <View key={idx} style={styles.experienceItem}>
                <View style={styles.experienceHeader}>
                  <Text style={styles.experienceTitle}>
                    {proj.title || "Project"}
                    {proj.link && <Text style={styles.experienceCompany}> | {proj.link}</Text>}
                  </Text>
                  <Text style={styles.experienceDate}>{proj.duration || ""}</Text>
                </View>
                
                {proj.description && proj.description.split(/(?:\n|•)/).filter(b => b.trim().length > 3).map((bullet, bIdx) => (
                  <View key={bIdx} style={styles.bulletPoint}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.bulletText}>{bullet.trim()}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Education */}
        {education && education.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Education</Text>
            {education.map((edu, idx) => (
              <View key={idx} style={styles.experienceItem}>
                <View style={styles.experienceHeader}>
                  <Text style={styles.experienceTitle}>
                    {edu.institution || edu.school || "Institution"}
                  </Text>
                  <Text style={styles.experienceDate}>{edu.year || ""}</Text>
                </View>
                <Text style={styles.text}>{edu.degree || edu.field || ""}</Text>
              </View>
            ))}
          </View>
        )}

      </Page>
    </Document>
  );
};
