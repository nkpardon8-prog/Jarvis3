"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { BookOpen } from "lucide-react";

export function SkillGuidelinesPanel() {
  return (
    <GlassPanel className="border-hud-amber/30 mt-2">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen size={14} className="text-hud-amber" />
        <h4 className="text-xs font-semibold text-hud-amber">
          Skill Writing Guidelines
        </h4>
      </div>

      <div className="space-y-3 text-[11px] text-hud-text-secondary leading-relaxed">
        <p>
          Skills are markdown documents the agent reads at runtime. Write them
          as clear, direct instructions.
        </p>

        <div>
          <p className="text-hud-text font-medium mb-1">Structure:</p>
          <ul className="list-disc list-inside space-y-0.5 text-hud-text-muted">
            <li>
              Start with 1-2 sentences of context: what is this API and when
              should the agent use it
            </li>
            <li>
              Describe authentication by referencing environment variable names,
              not raw credentials
            </li>
            <li>
              List key API endpoints with example requests and expected response
              shapes
            </li>
            <li>
              Be specific: &ldquo;POST to /api/v1/tasks with title,
              description, and due_date&rdquo; is better than &ldquo;create
              tasks&rdquo;
            </li>
          </ul>
        </div>

        <div>
          <p className="text-hud-text font-medium mb-1">Best Practices:</p>
          <ul className="list-disc list-inside space-y-0.5 text-hud-text-muted">
            <li>Include example payloads the agent can use as templates</li>
            <li>
              Cover error handling, rate limits, required headers, and
              pagination patterns
            </li>
            <li>
              Mention what the agent should NOT do (e.g., never delete without
              user confirmation)
            </li>
            <li>
              Keep instructions under ~2000 words since the agent&apos;s context
              window is finite
            </li>
          </ul>
        </div>

        <div className="bg-hud-bg/50 rounded-lg p-3 font-mono text-[10px] text-hud-text-muted">
          <p className="text-hud-amber mb-1">Example:</p>
          <pre className="whitespace-pre-wrap">
{`This is a weather data API. Use it when the user asks
about weather forecasts, current conditions, or climate data.

## Key Endpoints

GET /current?location={city}
- Returns current temperature, humidity, and conditions
- Example response: { "temp": 72, "unit": "F", "condition": "sunny" }

POST /forecast
- Body: { "location": "New York", "days": 5 }
- Returns 5-day forecast array

## Important Notes
- Rate limit: 100 requests/minute
- Always include the header Accept: application/json
- Never make more than 10 requests in a single agent turn`}
          </pre>
        </div>

        <p className="text-[10px] text-hud-text-muted italic">
          The system auto-generates YAML frontmatter from the form inputs.
          You only need to write the instruction body above.
        </p>
      </div>
    </GlassPanel>
  );
}
