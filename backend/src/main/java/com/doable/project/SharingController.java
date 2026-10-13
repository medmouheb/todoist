package com.doable.project;

import com.doable.common.CurrentUser;
import com.doable.project.ProjectDtos.InviteRequest;
import com.doable.project.ProjectDtos.InviteResponse;
import com.doable.project.ProjectDtos.RoleRequest;
import com.doable.project.ProjectDtos.SharingResponse;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SharingController {

    private final SharingService sharing;

    public SharingController(SharingService sharing) {
        this.sharing = sharing;
    }

    /** Members and pending invites of a project, plus the caller's own role. */
    @GetMapping("/api/projects/{id}/sharing")
    public SharingResponse sharing(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        return sharing.sharing(CurrentUser.id(jwt), id);
    }

    @PostMapping("/api/projects/{id}/invites")
    @ResponseStatus(HttpStatus.CREATED)
    public InviteResponse invite(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id,
                                 @Valid @RequestBody InviteRequest req) {
        return sharing.invite(CurrentUser.id(jwt), id, req);
    }

    @DeleteMapping("/api/projects/{id}/invites/{inviteId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revoke(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id, @PathVariable Long inviteId) {
        sharing.revokeInvite(CurrentUser.id(jwt), id, inviteId);
    }

    @PutMapping("/api/projects/{id}/members/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changeRole(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id, @PathVariable Long userId,
                           @Valid @RequestBody RoleRequest req) {
        sharing.changeRole(CurrentUser.id(jwt), id, userId, req.role());
    }

    /** Remove someone, or yourself to leave the project. */
    @DeleteMapping("/api/projects/{id}/members/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id, @PathVariable Long userId) {
        sharing.removeMember(CurrentUser.id(jwt), id, userId);
    }

    @GetMapping("/api/invites")
    public List<InviteResponse> myInvites(@AuthenticationPrincipal Jwt jwt) {
        return sharing.myInvites(CurrentUser.id(jwt));
    }

    @PostMapping("/api/invites/{inviteId}/accept")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void accept(@AuthenticationPrincipal Jwt jwt, @PathVariable Long inviteId) {
        sharing.respond(CurrentUser.id(jwt), inviteId, true);
    }

    @PostMapping("/api/invites/{inviteId}/decline")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void decline(@AuthenticationPrincipal Jwt jwt, @PathVariable Long inviteId) {
        sharing.respond(CurrentUser.id(jwt), inviteId, false);
    }
}
