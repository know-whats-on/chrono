import React, { useState, useEffect } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Plus, Trash2, Users, Search, ChevronDown } from "lucide-react";
import { DebateConfig, DebateRound, DebateTeam, Student } from "../types";
import { toast } from "sonner";
import * as kv from "../utils/kv";

interface Props {
  config: DebateConfig;
  courseId: string;
  onChange: (config: DebateConfig) => void;
}

export function DebateSetup({ config, courseId, onChange }: Props) {
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  
  useEffect(() => {
    async function load() {
      try {
        const data = await kv.get("CHATGPT_students_global");
        if (data && Array.isArray(data)) {
          // Filter by course if selected
          const filtered = courseId ? data.filter(s => s.courseId === courseId) : data;
          setAllStudents(filtered);
        }
      } catch (err) {}
    }
    load();
  }, [courseId]);

  const handleAddRound = () => {
    const newRound: DebateRound = {
      id: crypto.randomUUID(),
      name: `Round ${config.rounds.length + 1}`,
      speakingTeam: "both",
      timeLimit: 300, // 5 mins
    };
    onChange({ ...config, rounds: [...config.rounds, newRound] });
  };

  const handleUpdateRound = (id: string, updates: Partial<DebateRound>) => {
    onChange({
      ...config,
      rounds: config.rounds.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    });
  };

  const handleRemoveRound = (id: string) => {
    onChange({
      ...config,
      rounds: config.rounds.filter((r) => r.id !== id),
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <label className="text-[14px] font-bold text-[#45474B]">Topic of Debate</label>
        <Input
          placeholder="e.g. AI should be banned in schools"
          value={config.topic}
          onChange={(e) => onChange({ ...config, topic: e.target.value })}
          className="h-12 rounded-[14px] bg-white border border-gray-200 shadow-sm text-[15px] placeholder:text-[#8E8E93]"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[14px] font-bold text-[#45474B]">Team Size Limit (Per Team)</label>
        <Input
          type="number"
          min={1}
          value={config.teamSizeLimit}
          onChange={(e) => onChange({ ...config, teamSizeLimit: parseInt(e.target.value) || 1 })}
          className="h-12 rounded-[14px] bg-white border border-gray-200 shadow-sm text-[15px]"
        />
      </div>

      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <label className="text-[14px] font-bold text-[#45474B]">Debate Rounds</label>
          <button
            onClick={handleAddRound}
            className="flex items-center gap-1.5 h-[34px] px-3.5 text-[13px] font-semibold text-[#0a84ff] border border-[#0a84ff]/30 rounded-full bg-white transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add Round
          </button>
        </div>

        <div className="space-y-4">
          {config.rounds.length === 0 ? (
            <div className="text-center py-6 bg-white rounded-[16px] border border-dashed border-gray-300 text-[15px] text-gray-400">
              No rounds added yet.
            </div>
          ) : (
            config.rounds.map((round, i) => (
              <div key={round.id} className="bg-white p-4 rounded-[16px] border border-gray-100/60 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex items-start gap-3 relative">
                <button
                  onClick={() => handleRemoveRound(round.id)}
                  className="absolute -right-2 -top-2 h-7 w-7 bg-white rounded-full shadow-md text-gray-400 hover:text-red-500 flex items-center justify-center border border-gray-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <div className="flex-1 space-y-3">
                  <div className="flex flex-col gap-1.5 w-full">
                    <div className="flex items-center gap-3 w-full">
                      <span className="text-[15px] font-bold text-gray-300 w-4 shrink-0 mt-2">{i + 1}.</span>
                      <div className="flex-1 space-y-1">
                        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Round Name</label>
                        <Input
                          value={round.name}
                          onChange={(e) => handleUpdateRound(round.id, { name: e.target.value })}
                          placeholder="e.g. Opening Statements"
                          className="h-11 rounded-[10px] bg-[#FAFAFA] border border-gray-200 text-[15px] font-semibold text-[#1a1a24] placeholder:text-[#8E8E93]"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pl-7">
                    <div className="relative flex-1">
                      <select
                        value={round.speakingTeam}
                        onChange={(e) => handleUpdateRound(round.id, { speakingTeam: e.target.value as any })}
                        className="w-full h-11 pl-3 pr-8 text-[15px] text-[#1a1a24] font-medium rounded-[10px] border border-gray-200 bg-[#FAFAFA] outline-none appearance-none"
                      >
                        <option value="both">Both Teams Speak</option>
                        <option value="for">For Team Speaks</option>
                        <option value="against">Against Team Speaks</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Input
                        type="number"
                        value={Math.floor(round.timeLimit / 60)}
                        onChange={(e) => {
                          const mins = parseInt(e.target.value) || 0;
                          handleUpdateRound(round.id, { timeLimit: mins * 60 });
                        }}
                        className="h-11 w-12 text-[15px] font-medium text-center rounded-[10px] border border-gray-200 bg-white px-0"
                      />
                      <span className="text-[14px] font-medium text-gray-500">m</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Team Assignments */}
      <div className="pt-2">
        <div className="bg-white p-4 rounded-[16px] border border-gray-200 text-[15px] space-y-4">
          <div>
            <p className="font-semibold text-[#1a1a24]">Team Assignments</p>
            <p className="text-gray-500 text-[13px] mt-0.5 leading-snug">
              Assign students to teams now, or let them join freely during the live session.
            </p>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search students to assign..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 pl-9 rounded-[10px] bg-gray-50 border-none text-[14px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {config.teams.map((team) => (
              <div key={team.name} className={`p-3 rounded-[12px] border ${team.name === "for" ? "border-blue-200 bg-blue-50/30" : "border-red-200 bg-red-50/30"}`}>
                <h4 className={`font-bold text-[11px] uppercase tracking-wider mb-2 ${team.name === "for" ? "text-blue-700" : "text-red-700"}`}>
                  Team {team.name} ({team.studentIds.length}/{config.teamSizeLimit})
                </h4>
                <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                  {team.studentIds.length === 0 ? (
                    <p className="text-[11px] text-gray-400 italic">No students</p>
                  ) : (
                    team.studentIds.map(sid => {
                      const s = allStudents.find(st => st.id === sid);
                      return (
                        <div key={sid} className="flex items-center justify-between bg-white px-2 py-1.5 rounded-[8px] border border-gray-100 shadow-sm">
                          <span className="text-[12px] truncate">{s ? `${s.firstName} ${s.lastName}` : sid}</span>
                          <button
                            onClick={() => {
                              const newTeams = config.teams.map(t => 
                                t.name === team.name ? { ...t, studentIds: t.studentIds.filter(id => id !== sid) } : t
                              );
                              onChange({ ...config, teams: newTeams });
                            }}
                            className="text-gray-400 hover:text-red-500 p-0.5"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>

          {searchQuery && (
            <div className="mt-2 border border-gray-100 rounded-[10px] overflow-hidden max-h-40 overflow-y-auto">
              {allStudents.filter(s => 
                !config.teams.some(t => t.studentIds.includes(s.id)) &&
                (`${s.firstName} ${s.lastName} ${s.studentNumber}`.toLowerCase().includes(searchQuery.toLowerCase()))
              ).map(s => (
                <div key={s.id} className="flex items-center justify-between p-2.5 bg-white hover:bg-gray-50 border-b border-gray-50 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{s.firstName} {s.lastName}</p>
                    <p className="text-[11px] text-gray-500 truncate">{s.studentNumber} {s.groupId ? `· Grp ${s.groupId}` : ''}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0 ml-2">
                    <button
                      onClick={() => {
                        const forTeam = config.teams.find(t => t.name === "for");
                        if (forTeam && forTeam.studentIds.length < config.teamSizeLimit) {
                          const newTeams = config.teams.map(t => 
                            t.name === "for" ? { ...t, studentIds: [...t.studentIds, s.id] } : t
                          );
                          onChange({ ...config, teams: newTeams });
                        } else {
                          toast.error("Team For is full");
                        }
                      }}
                      className="px-2 py-1 text-[10px] font-bold rounded-[6px] bg-blue-100 text-blue-700 hover:bg-blue-200"
                    >
                      FOR
                    </button>
                    <button
                      onClick={() => {
                        const againstTeam = config.teams.find(t => t.name === "against");
                        if (againstTeam && againstTeam.studentIds.length < config.teamSizeLimit) {
                          const newTeams = config.teams.map(t => 
                            t.name === "against" ? { ...t, studentIds: [...t.studentIds, s.id] } : t
                          );
                          onChange({ ...config, teams: newTeams });
                        } else {
                          toast.error("Team Against is full");
                        }
                      }}
                      className="px-2 py-1 text-[10px] font-bold rounded-[6px] bg-red-100 text-red-700 hover:bg-red-200"
                    >
                      AGAINST
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
